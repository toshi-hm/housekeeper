import { z } from "zod";

// ---------------------------------------------------------------------------
// TOTP code validation
// ---------------------------------------------------------------------------

// messageはi18nキー（mfa namespace）。呼び出し側でt()に通してから表示すること（#620）。
export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "codeInvalid");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MfaFactorSummary {
  id: string;
  factorType: string;
  status: "verified" | "unverified";
}

export interface AuthenticatorAssuranceLevel {
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** アカウントに有効化済み（verified）のTOTP factorが存在するかどうか。 */
export const hasVerifiedTotpFactor = (factors: MfaFactorSummary[]): boolean =>
  factors.some((f) => f.factorType === "totp" && f.status === "verified");

/**
 * ログイン時のチャレンジに使う、verified状態のTOTP factorを1件選ぶ。
 * 複数存在する場合は先頭を採用する。
 */
export const selectVerifiedTotpFactor = (factors: MfaFactorSummary[]): MfaFactorSummary | null =>
  factors.find((f) => f.factorType === "totp" && f.status === "verified") ?? null;

/**
 * `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` の結果から、
 * aal2への昇格（MFAコード入力）がまだ完了していないかどうかを判定する。
 */
export const isMfaChallengeRequired = (
  aal: AuthenticatorAssuranceLevel | null | undefined,
): boolean => {
  if (!aal) return true;
  return aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
};

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

/**
 * SupabaseのMFAエラーメッセージを、表示用のi18nキー（mfa namespace）へ変換する。
 * 呼び出し側で t() に通してから表示すること（#620）。
 */
export const translateMfaError = (message: string): string => {
  if (message.includes("Invalid TOTP code") || message.includes("invalid_code")) {
    return "codeInvalidOrExpired";
  }
  if (message.includes("factor is not verified") || message.includes("not_verified")) {
    return "verificationFailed";
  }
  if (message.includes("over_email_send_rate_limit") || message.includes("rate limit")) {
    return "rateLimitError";
  }
  if (message.includes("mfa_factor_not_found") || message.includes("Factor not found")) {
    return "factorNotFound";
  }
  return "verifyFailed";
};
