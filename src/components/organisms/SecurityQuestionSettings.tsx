import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useSecurityQuestionStatus, useUpsertSecurityQuestion } from "@/hooks/useSecurityQuestion";
import {
  SECURITY_QUESTION_IDS,
  securityQuestionFormSchema,
  securityQuestionLabelKey,
} from "@/lib/auth";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";

/**
 * 設定画面から秘密の質問・答えを設定/更新するフォーム（#850）。
 *
 * メール確認必須の設定でサインアップすると、サインアップ時点では
 * `data.session` が null のため秘密の質問を保存できない（LoginPage.handleSignup
 * 参照）。この画面が唯一の設定/変更手段になる。
 */
export const SecurityQuestionSettings = () => {
  const { t } = useTranslation("auth");
  const { toast } = useToast();
  const { data: status, isLoading } = useSecurityQuestionStatus();
  const upsert = useUpsertSecurityQuestion();

  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const startEditing = () => {
    setQuestion("");
    setAnswer("");
    setFieldErrors({});
    setEditing(true);
  };

  const handleSave = async () => {
    const result = securityQuestionFormSchema.safeParse({
      securityQuestion: question,
      securityAnswer: answer,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) errs[issue.path[0] as string] = t(issue.message);
      setFieldErrors(errs);
      return;
    }

    try {
      await upsert.mutateAsync({
        question: result.data.securityQuestion,
        answer: result.data.securityAnswer,
      });
      toast(t("securityQuestionSaveSuccess"), "success");
      setEditing(false);
      setQuestion("");
      setAnswer("");
      setFieldErrors({});
    } catch (err) {
      toast(
        err instanceof OfflineError ? t("common:offlineError") : t("securityQuestionSaveFailed"),
        "error",
      );
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{t("securityQuestionSettingsTitle")}</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
      ) : !editing ? (
        <>
          <p className="text-sm">
            {status?.hasSecurityQuestion ? status.question : t("securityQuestionNotSet")}
          </p>
          <p className="text-xs text-muted-foreground">{t("securityQuestionSettingsHelp")}</p>
          <Button
            type="button"
            variant={status?.hasSecurityQuestion ? "outline" : "default"}
            size="sm"
            onClick={startEditing}
          >
            {status?.hasSecurityQuestion
              ? t("securityQuestionUpdateButton")
              : t("securityQuestionSetButton")}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="settingsSecurityQuestion">{t("securityQuestion")}</Label>
            <Select
              id="settingsSecurityQuestion"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
            >
              <option value="">{t("selectSecurityQuestion")}</option>
              {SECURITY_QUESTION_IDS.map((id) => (
                <option key={id} value={t(securityQuestionLabelKey[id])}>
                  {t(securityQuestionLabelKey[id])}
                </option>
              ))}
            </Select>
            {fieldErrors.securityQuestion && (
              <p className="text-xs text-destructive">{fieldErrors.securityQuestion}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="settingsSecurityAnswer">{t("securityAnswer")}</Label>
            <Input
              id="settingsSecurityAnswer"
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t("securityAnswerPlaceholder")}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t("securityAnswerHint")}</p>
            {fieldErrors.securityAnswer && (
              <p className="text-xs text-destructive">{fieldErrors.securityAnswer}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              disabled={upsert.isPending}
              onClick={() => {
                void handleSave();
              }}
            >
              {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common:save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              size="sm"
              disabled={upsert.isPending}
              onClick={() => {
                setEditing(false);
                setFieldErrors({});
              }}
            >
              {t("common:cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
