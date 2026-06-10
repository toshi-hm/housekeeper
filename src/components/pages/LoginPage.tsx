import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Package } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { PasswordStrength } from "@/components/atoms/PasswordStrength";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { isAvailableRegisterNewUser } from "@/config/auth";
import {
  loginSchema,
  SECURITY_QUESTIONS,
  sha256hex,
  signupSchema,
  translateAuthError,
} from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";

export const LoginPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation("auth");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const effectiveMode = isAvailableRegisterNewUser ? mode : "login";
  const isSignupMode = effectiveMode === "signup";

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
    if (next === "signup" && !isAvailableRegisterNewUser) {
      return;
    }

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
    if (!isAvailableRegisterNewUser) {
      throw new Error("現在、新規ユーザー登録は受け付けていません。");
    }

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
      toast(t("signUpEmailSent"), "success");
      switchMode("login");
      return;
    }

    // Store security question (user is now authenticated)
    const answerHash = await sha256hex(
      data.session.user.id + ":" + securityAnswer.toLowerCase().trim(),
    );
    const { error: sqError } = await supabase.from("user_security_questions").upsert({
      user_id: data.session.user.id,
      email: email.toLowerCase().trim(),
      question: securityQuestion,
      answer_hash: answerHash,
    });
    if (sqError) {
      await supabase.auth.signOut();
      throw new Error(t("setupError"));
    }

    void navigate({ to: "/" });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearErrors();
    setIsLoading(true);
    try {
      if (isSignupMode) {
        await handleSignup();
      } else {
        await handleLogin();
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : t("authError"));
    } finally {
      setIsLoading(false);
    }
  };

  // Real-time confirm password check
  const confirmMismatch =
    isSignupMode && confirmPassword.length > 0 && confirmPassword !== password;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Package className="h-8 w-8" />
          Housekeeper
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("appTagline")}</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="pb-4">
          <CardTitle>{isSignupMode ? t("signUpTitle") : t("signInTitle")}</CardTitle>
          <CardDescription>
            {isSignupMode ? t("signUpDescription") : t("signInDescription")}
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
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailInputPlaceholder")}
                required
                autoComplete="email"
              />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="password">{t("passwordLabel")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={isSignupMode ? "new-password" : "current-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              )}
              {isSignupMode && <PasswordStrength password={password} />}
            </div>

            {/* Signup-only fields */}
            {isSignupMode && (
              <>
                {/* Confirm password */}
                <div className="space-y-1">
                  <Label htmlFor="confirmPassword">{t("confirmPasswordLabel")}</Label>
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
                      aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmMismatch && (
                    <p className="text-xs text-destructive">{t("passwordMismatch")}</p>
                  )}
                  {fieldErrors.confirmPassword && !confirmMismatch && (
                    <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                  )}
                </div>

                {/* Secret question */}
                <div className="space-y-1">
                  <Label htmlFor="securityQuestion">{t("securityQuestion")}</Label>
                  <Select
                    id="securityQuestion"
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    required
                  >
                    <option value="">{t("selectQuestion")}</option>
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
                  <Label htmlFor="securityAnswer">{t("securityAnswer")}</Label>
                  <Input
                    id="securityAnswer"
                    type="text"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder={t("answerPlaceholder")}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">{t("answerHint")}</p>
                  {fieldErrors.securityAnswer && (
                    <p className="text-xs text-destructive">{fieldErrors.securityAnswer}</p>
                  )}
                </div>
              </>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignupMode ? t("signUpButton") : t("signInButton")}
            </Button>

            {isAvailableRegisterNewUser ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => switchMode(isSignupMode ? "login" : "signup")}
              >
                {isSignupMode ? t("switchToSignInFull") : t("switchToSignUpFull")}
              </Button>
            ) : (
              <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                現在、新規ユーザー登録は受け付けていません。登録済みのアカウントでサインインしてください。
              </div>
            )}

            {!isSignupMode && (
              <div className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
