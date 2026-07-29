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
