import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, Loader2, Package } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const callEdge = async <T,>(fn: string, body: unknown): Promise<T> => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "エラーが発生しました");
  return data;
};

const ALLOWED_CHARS = /^[a-zA-Z0-9\-_!?#@$%^&*()+={}[\]|;:'",.<>\\/~`]+$/;

const newPasswordSchema = z
  .string()
  .min(8, "8文字以上で入力してください")
  .regex(ALLOWED_CHARS, "半角英数字と記号のみ使用できます")
  .refine((val) => {
    let types = 0;
    if (/[a-z]/.test(val)) types++;
    if (/[A-Z]/.test(val)) types++;
    if (/[0-9]/.test(val)) types++;
    if (/[-_!?#@$%^&*()+={}[\]|;:'",.<>\\/~`]/.test(val)) types++;
    return types >= 3;
  }, "大文字・小文字・数字・記号のうち3種類以上を使用してください");

// ---------------------------------------------------------------------------
// Step 1: Email entry
// ---------------------------------------------------------------------------

interface Step1Props {
  onNext: (email: string, question: string) => void;
}

const Step1 = ({ onNext }: Step1Props) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setIsLoading(true);
    try {
      const { question } = await callEdge<{ question: string }>("get-security-question", {
        email,
      });
      onNext(email, question);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <CardHeader className="pb-4">
        <CardTitle>パスワードをリセット</CardTitle>
        <CardDescription>登録済みのメールアドレスを入力してください</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            次へ
          </Button>
        </form>
      </CardContent>
    </>
  );
};

// ---------------------------------------------------------------------------
// Step 2: Answer + new password
// ---------------------------------------------------------------------------

interface Step2Props {
  email: string;
  question: string;
  onBack: () => void;
}

const Step2 = ({ email, question, onBack }: Step2Props) => {
  const navigate = useNavigate();
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const pwResult = newPasswordSchema.safeParse(newPassword);
    if (!pwResult.success) {
      setFieldErrors({ newPassword: pwResult.error.issues[0].message });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: "パスワードが一致しません" });
      return;
    }
    if (!answer.trim()) {
      setFieldErrors({ answer: "答えを入力してください" });
      return;
    }

    setIsLoading(true);
    try {
      await callEdge("verify-security-answer", {
        email,
        answer: answer.trim(),
        new_password: newPassword,
      });
      alert("パスワードを変更しました。新しいパスワードでサインインしてください。");
      void navigate({ to: "/login" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <CardHeader className="pb-4">
        <CardTitle>秘密の質問に回答</CardTitle>
        <CardDescription>
          登録時に設定した秘密の質問に答え、新しいパスワードを設定してください
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Secret question (read-only) */}
          <div className="space-y-1">
            <Label>秘密の質問</Label>
            <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm">{question}</p>
          </div>

          {/* Answer */}
          <div className="space-y-1">
            <Label htmlFor="answer">答え</Label>
            <Input
              id="answer"
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="登録時に入力した答え"
              autoComplete="off"
              required
            />
            {fieldErrors.answer && <p className="text-xs text-destructive">{fieldErrors.answer}</p>}
          </div>

          {/* New password */}
          <div className="space-y-1">
            <Label htmlFor="newPassword">新しいパスワード</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showNew ? "パスワードを隠す" : "パスワードを表示"}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.newPassword && (
              <p className="text-xs text-destructive">{fieldErrors.newPassword}</p>
            )}
          </div>

          {/* Confirm new password */}
          <div className="space-y-1">
            <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showConfirm ? "パスワードを隠す" : "パスワードを表示"}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmMismatch && (
              <p className="text-xs text-destructive">パスワードが一致しません</p>
            )}
            {fieldErrors.confirmPassword && !confirmMismatch && (
              <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            パスワードを変更する
          </Button>

          <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            メールアドレス入力に戻る
          </Button>
        </form>
      </CardContent>
    </>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ForgotPasswordPage = () => {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState("");

  const handleStep1Next = (resolvedEmail: string, resolvedQuestion: string) => {
    setEmail(resolvedEmail);
    setQuestion(resolvedQuestion);
    setStep(2);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Package className="h-8 w-8" />
          Housekeeper
        </div>
      </div>

      <Card className="w-full max-w-sm">
        {step === 1 ? (
          <Step1 onNext={handleStep1Next} />
        ) : (
          <Step2 email={email} question={question} onBack={() => setStep(1)} />
        )}

        <div className="px-6 pb-6 text-center">
          <Link
            to="/login"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            サインインに戻る
          </Link>
        </div>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: ForgotPasswordPage,
});
