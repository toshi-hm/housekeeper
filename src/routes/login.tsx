import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Package } from "lucide-react";
import { useState } from "react";

import { PasswordStrength } from "@/components/atoms/PasswordStrength";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  loginSchema,
  SECURITY_QUESTIONS,
  sha256hex,
  signupSchema,
  translateAuthError,
} from "@/lib/auth";
import { supabase } from "@/lib/supabase";

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
    await supabase.from("user_security_questions").upsert({
      user_id: data.session.user.id,
      email: email.toLowerCase().trim(),
      question: securityQuestion,
      answer_hash: answerHash,
    });

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
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
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
                  <Select
                    id="securityQuestion"
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    required
                  >
                    <option value="">質問を選択してください</option>
                    {SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
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
