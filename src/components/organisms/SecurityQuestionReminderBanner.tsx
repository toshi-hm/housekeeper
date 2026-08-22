import { Link } from "@tanstack/react-router";
import { KeyRound, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSecurityQuestionStatus } from "@/hooks/useSecurityQuestion";

/**
 * メール確認必須の設定でサインアップすると、サインアップ直後は
 * `data.session` が null になり秘密の質問を保存できない（#850）。
 * 認証済みの全画面（`_auth.tsx` AuthLayout）に常時マウントし、未登録を
 * 検知した場合に設定画面（/settings）へ誘導する。
 *
 * 閉じるボタンは現在のセッション内でのみバナーを隠す（次回リロード/
 * サインイン時には未設定である限り再度表示する）。取得中・取得失敗
 * （オフライン等）の場合は誤検知を避けるため何も表示しない。
 */
export const SecurityQuestionReminderBanner = () => {
  const { t } = useTranslation("auth");
  const { data: status } = useSecurityQuestionStatus();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !status || status.hasSecurityQuestion) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30"
    >
      <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          {t("securityQuestionReminderTitle")}
        </p>
        <p className="mt-0.5 text-amber-800 dark:text-amber-200">
          {t("securityQuestionReminderBody")}
        </p>
        <Link
          to="/settings"
          className="mt-2 inline-block text-xs font-medium text-amber-900 underline underline-offset-2 dark:text-amber-100"
        >
          {t("securityQuestionReminderCta")}
        </Link>
      </div>
      <button
        type="button"
        aria-label={t("common:close")}
        className="shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
