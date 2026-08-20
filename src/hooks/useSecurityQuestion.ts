import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sha256hex } from "@/lib/auth";
import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";

/**
 * サインアップ完了直後（#670）に秘密の質問を保存する。
 * コンポーネントから直接 supabase.from() を呼ばないという規約（PLANS.md §5.3）
 * に合わせてフック層に切り出したもの。
 */
export const upsertSecurityQuestion = async (params: {
  userId: string;
  email: string;
  question: string;
  answerHash: string;
}): Promise<void> => {
  requireOnline();
  const { error } = await supabase.from("user_security_questions").upsert({
    user_id: params.userId,
    email: params.email,
    question: params.question,
    answer_hash: params.answerHash,
  });
  if (error) throw error;
};

export const SECURITY_QUESTION_STATUS_KEY = ["security-question-status"] as const;

export interface SecurityQuestionStatus {
  hasSecurityQuestion: boolean;
  /** 設定済みの質問文言（サインアップ/設定画面で選択した時点の言語）。未設定ならnull。 */
  question: string | null;
}

const fetchSecurityQuestionStatus = async (): Promise<SecurityQuestionStatus> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { hasSecurityQuestion: false, question: null };

  const { data, error } = await supabase
    .from("user_security_questions")
    .select("question")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw error;

  return { hasSecurityQuestion: data !== null, question: data?.question ?? null };
};

/**
 * サインイン中ユーザーが秘密の質問を登録済みかどうかを取得する（#850）。
 *
 * メール確認必須の設定でサインアップした場合、サインアップ直後は
 * `data.session` が null になり `upsertSecurityQuestion` を呼べない
 * （LoginPage.handleSignup 参照）。この状態のまま利用を続けると、
 * パスワードを忘れた際に唯一の復旧手段（秘密の質問）が機能しない。
 * `SecurityQuestionReminderBanner` と設定画面の `SecurityQuestionSettings`
 * がこのフックで未登録を検知し、ログイン後に設定を促す/設定できるようにする。
 */
export const useSecurityQuestionStatus = () =>
  useQuery({
    queryKey: SECURITY_QUESTION_STATUS_KEY,
    queryFn: fetchSecurityQuestionStatus,
    staleTime: 30_000,
  });

/**
 * ログイン中ユーザー自身が秘密の質問・答えを設定/更新する（#850）。
 * サインアップ直後の `data.session` 存在時にしか呼べなかった
 * `upsertSecurityQuestion` と異なり、現在のセッションから userId/email を
 * 取得してから呼び出す。
 */
export const useUpsertSecurityQuestion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { question: string; answer: string }): Promise<void> => {
      requireOnline();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Not authenticated");

      const answerHash = await sha256hex(
        userData.user.id + ":" + params.answer.toLowerCase().trim(),
      );
      await upsertSecurityQuestion({
        userId: userData.user.id,
        email: (userData.user.email ?? "").toLowerCase().trim(),
        question: params.question,
        answerHash,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SECURITY_QUESTION_STATUS_KEY });
    },
  });
};
