import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Package, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PasswordStrength } from "@/components/atoms/PasswordStrength";
import { TotpCodeInput } from "@/components/molecules/TotpCodeInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { isAvailableRegisterNewUser } from "@/config/auth";
import {
  loginSchema,
  SECURITY_QUESTION_IDS,
  securityQuestionLabelKey,
  sha256hex,
  signupSchema,
  translateAuthError,
} from "@/lib/auth";
import {
  isMfaChallengeRequired,
  selectVerifiedTotpFactor,
  totpCodeSchema,
  translateMfaError,
} from "@/lib/mfa";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";

/**
 * 現在のセッションがaal2への昇格（=MFAコード入力）待ちの場合、
 * チャレンジ対象のverified TOTP factorIdを返す。未完了でなければnull。
 */
const resolvePendingTotpFactorId = async (): Promise<string | null> => {
  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) throw aalError;
  if (!isMfaChallengeRequired(aal)) return null;

  const { data: factorsData, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;

  const factor = selectVerifiedTotpFactor(
    factorsData.totp.map((f) => ({ id: f.id, factorType: f.factor_type, status: f.status })),
  );
  if (!factor) throw new Error("Verified MFA factor not found");
  return factor.id;
};

export const LoginPage = () => {
  const { t } = useTranslation("auth");
  const { t: tm } = useTranslation("mfa");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "signup" | "mfa">("login");
  const effectiveMode = mode === "signup" && !isAvailableRegisterNewUser ? "login" : mode;
  const isSignupMode = effectiveMode === "signup";
  const isMfaMode = effectiveMode === "mfa";

  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Signup-only fields
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");

  // MFA-only fields
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const clearErrors = () => {
    setFieldErrors({});
    setGlobalError(null);
  };

  // 既にサインイン済みだがMFAコード入力が未完了のセッションが残っている場合
  // （リロード等）、パスワード入力を飛ばしてコード入力ステップを表示する（#366）。
  useEffect(() => {
    let cancelled = false;
    void resolvePendingTotpFactorId()
      .then((factorId) => {
        if (!cancelled && factorId) {
          setMfaFactorId(factorId);
          setMode("mfa");
        }
      })
      .catch(() => {
        if (!cancelled) setGlobalError(t("authFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

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
      for (const issue of result.error.issues) errs[issue.path[0] as string] = t(issue.message);
      setFieldErrors(errs);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(t(translateAuthError(error.message)));

    const factorId = await resolvePendingTotpFactorId();
    if (factorId) {
      setMfaFactorId(factorId);
      setMfaCode("");
      setMode("mfa");
      return;
    }
    void navigate({ to: "/" });
  };

  const handleSignup = async () => {
    if (!isAvailableRegisterNewUser) {
      throw new Error(t("signupNotAllowed"));
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
      for (const issue of result.error.issues) errs[issue.path[0] as string] = t(issue.message);
      setFieldErrors(errs);
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(t(translateAuthError(error.message)));

    if (!data.session) {
      // Email confirmation required
      setGlobalError(null);
      setFieldErrors({});
      toast(t("confirmationEmailSent"), "success");
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
      throw new Error(t("accountSetupFailed"));
    }

    void navigate({ to: "/" });
  };

  const handleMfaVerify = async () => {
    const result = totpCodeSchema.safeParse(mfaCode);
    if (!result.success) {
      setFieldErrors({ mfaCode: tm(result.error.issues[0]?.message ?? "codeInvalid") });
      return;
    }
    if (!mfaFactorId) {
      setGlobalError(t("authFailed"));
      return;
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfaFactorId,
      code: result.data,
    });
    if (error) throw new Error(tm(translateMfaError(error.message)));
    void navigate({ to: "/" });
  };

  const handleMfaCancel = async () => {
    await supabase.auth.signOut();
    setMfaFactorId(null);
    setMfaCode("");
    setPassword("");
    setMode("login");
    clearErrors();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearErrors();
    setIsLoading(true);
    try {
      if (isMfaMode) {
        await handleMfaVerify();
      } else if (isSignupMode) {
        await handleSignup();
      } else {
        await handleLogin();
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : t("authFailed"));
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
          <CardTitle>
            {isMfaMode
              ? tm("loginChallengeTitle")
              : isSignupMode
                ? t("signUpTitle")
                : t("signInTitle")}
          </CardTitle>
          <CardDescription>
            {isMfaMode
              ? tm("loginChallengeSubtitle")
              : isSignupMode
                ? t("signUpSubtitle")
                : t("signInSubtitle")}
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

            {isMfaMode ? (
              <>
                {/* MFA challenge */}
                <div className="flex justify-center text-primary">
                  <ShieldCheck className="h-10 w-10" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mfaCode">{tm("codeLabel")}</Label>
                  <TotpCodeInput id="mfaCode" value={mfaCode} onChange={setMfaCode} autoFocus />
                  {fieldErrors.mfaCode && (
                    <p className="text-xs text-destructive">{fieldErrors.mfaCode}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {tm("loginVerifyButton")}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    void handleMfaCancel();
                  }}
                >
                  {tm("loginBackToPassword")}
                </Button>
              </>
            ) : (
              <>
                {/* Email */}
                <div className="space-y-1">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                    required
                    autoComplete="email"
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-destructive">{fieldErrors.email}</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <Label htmlFor="password">{t("password")}</Label>
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
                      <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
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
                        <p className="text-xs text-destructive">{t("confirmPasswordMismatch")}</p>
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

                    {/* Secret answer */}
                    <div className="space-y-1">
                      <Label htmlFor="securityAnswer">{t("securityAnswer")}</Label>
                      <Input
                        id="securityAnswer"
                        type="text"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        placeholder={t("securityAnswerPlaceholder")}
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground">{t("securityAnswerHint")}</p>
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
                    {isSignupMode ? t("switchToSignIn") : t("switchToSignUp")}
                  </Button>
                ) : (
                  <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                    {t("signUpDisabled")}
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
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
