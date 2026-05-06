import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Package } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECURITY_QUESTIONS = [
  "初めて飼ったペットの名前は？",
  "幼少期に住んでいた街の名前は？",
  "母親の旧姓は？",
  "最初に通った小学校の名前は？",
  "子どもの頃の親友の名前は？",
  "好きな本や映画のタイトルは？",
  "初めての車のメーカーは？",
] as const;

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const ALLOWED_CHARS = /^[a-zA-Z0-9\-_!?#@$%^&*()+={}[\]|;:'",.<>\\/~`]+$/;

const passwordSchema = z
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

const signupSchema = z
  .object({
    email: z.string().email("有効なメールアドレスを入力してください"),
    password: passwordSchema,
    confirmPassword: z.string(),
    securityQuestion: z.string().min(1, "秘密の質問を選択してください"),
    securityAnswer: z.string().min(1, "答えを入力してください"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha256hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const translateAuthError = (message: string): string => {
  if (message.includes("over_email_send_rate_limit") || message.includes("email rate limit")) {
    return "メールの送信回数が上限に達しました。しばらく時間をおいてからお試しください。";
  }
  if (
    message.includes("User already registered") ||
    message.includes("user_already_exists") ||
    message.includes("already been registered")
  ) {
    return "このメールアドレスはすでに登録されています。";
  }
  if (message.includes("Invalid login credentials") || message.includes("invalid_credentials")) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  if (message.includes("Email not confirmed")) {
    return "メールアドレスが確認されていません。確認メールをご確認ください。";
  }
  if (message.includes("Password should be at least")) {
    return "パスワードが短すぎます。8文字以上で入力してください。";
  }
  return message;
};

// ---------------------------------------------------------------------------
// Password strength indicator
// ---------------------------------------------------------------------------

interface PasswordStrengthProps {
  password: string;
}

const PasswordStrength = ({ password }: PasswordStrengthProps) => {
  if (!password) return null;

  const checks = {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[-_!?#@$%^&*()+={}[\]|;:'",.<>\\/~`]/.test(password),
  };
  const typeCount = [checks.lower, checks.upper, checks.number, checks.symbol].filter(Boolean)
    .length;

  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      <li className={checks.length ? "text-green-600" : "text-destructive"}>
        {checks.length ? "✓" : "✗"} 8文字以上
      </li>
      <li className={typeCount >= 3 ? "text-green-600" : "text-destructive"}>
        {typeCount >= 3 ? "✓" : "✗"} 大文字・小文字・数字・記号のうち3種類以上（現在: {typeCount}種類）
      </li>
    </ul>
  );
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const LoginPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");

  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Signup-only fields
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const clearErrors = () => {
    setFieldErrors({});
    setGlobalError(null);
  };

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    clearErrors();
    setConfirmPassword("");
    setSecurityQuestion("");
    setSecurityAnswer("");
  };

  const handleLogin = async () => {
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) errs[issue.path[0] as string] = issue.message;
      setFieldErrors(errs);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error.message));
    void navigate({ to: "/" });
  };

  const handleSignup = async () => {
    const result = signupSchema.safeParse({
      email,
      password,
      confirmPassword,
      securityQuestion,
      securityAnswer,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) errs[issue.path[0] as string] = issue.message;
      setFieldErrors(errs);
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(translateAuthError(error.message));

    if (!data.session) {
      // Email confirmation required
      setGlobalError(null);
      setFieldErrors({});
      alert("確認メールを送信しました。メールのリンクをクリックしてからログインしてください。");
      switchMode("login");
      return;
    }

    // Store security question (user is now authenticated)
    const answerHash = await sha256hex(securityAnswer.toLowerCase().trim());
    const { error: sqError } = await supabase.from("user_security_questions").upsert({
      user_id: data.session.user.id,
      email: email.toLowerCase().trim(),
      question: securityQuestion,
      answer_hash: answerHash,
    });
    if (sqError) console.error("Failed to save security question:", sqError);

    void navigate({ to: "/" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    setIsLoading(true);
    try {
      if (mode === "login") {
        await handleLogin();
      } else {
        await handleSignup();
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "認証に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // Real-time confirm password check
  const confirmMismatch =
    mode === "signup" && confirmPassword.length > 0 && confirmPassword !== password;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Package className="h-8 w-8" />
          Housekeeper
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Home inventory management</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="pb-4">
          <CardTitle>{mode === "login" ? "サインイン" : "アカウント作成"}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "メールアドレスとパスワードでサインインします"
              : "情報を入力してアカウントを作成してください"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-4"
          >
            {globalError && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {globalError}
              </div>
            )}

            {/* Email */}
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
              {fieldErrors.email && (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="password">パスワード</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              )}
              {mode === "signup" && <PasswordStrength password={password} />}
            </div>

            {/* Signup-only fields */}
            {mode === "signup" && (
              <>
                {/* Confirm password */}
                <div className="space-y-1">
                  <Label htmlFor="confirmPassword">パスワード（確認）</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? "パスワードを隠す" : "パスワードを表示"}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmMismatch && (
                    <p className="text-xs text-destructive">パスワードが一致しません</p>
                  )}
                  {fieldErrors.confirmPassword && !confirmMismatch && (
                    <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                  )}
                </div>

                {/* Secret question */}
                <div className="space-y-1">
                  <Label htmlFor="securityQuestion">秘密の質問</Label>
                  <Select value={securityQuestion} onValueChange={setSecurityQuestion}>
                    <SelectTrigger id="securityQuestion">
                      <SelectValue placeholder="質問を選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECURITY_QUESTIONS.map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.securityQuestion && (
                    <p className="text-xs text-destructive">{fieldErrors.securityQuestion}</p>
                  )}
                </div>

                {/* Secret answer */}
                <div className="space-y-1">
                  <Label htmlFor="securityAnswer">秘密の質問の答え</Label>
                  <Input
                    id="securityAnswer"
                    type="text"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="答えを入力"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    パスワードを忘れた際の本人確認に使用します
                  </p>
                  {fieldErrors.securityAnswer && (
                    <p className="text-xs text-destructive">{fieldErrors.securityAnswer}</p>
                  )}
                </div>
              </>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "サインイン" : "アカウント作成"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => switchMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login"
                ? "アカウントをお持ちでない方はこちら"
                : "すでにアカウントをお持ちの方はこちら"}
            </Button>

            {mode === "login" && (
              <div className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  パスワードを忘れた方はこちら
                </Link>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
