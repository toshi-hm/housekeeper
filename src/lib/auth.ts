import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// 選択肢の表示ラベルはi18n経由（securityQuestionLabelKey）にし、UIの言語設定に
// 追従するようにする（#620）。DBへの保存値は現状どおり選択時点のラベル文字列の
// ままとし、保存フォーマット自体（言語非依存IDへの移行）は既存データの
// マイグレーションが必要なため別対応とする。
export const SECURITY_QUESTION_IDS = [
  "pet",
  "hometown",
  "mothersMaidenName",
  "elementarySchool",
  "childhoodFriend",
  "favoriteBookOrMovie",
  "firstCar",
] as const;

export type SecurityQuestionId = (typeof SECURITY_QUESTION_IDS)[number];

export const securityQuestionLabelKey = {
  pet: "securityQuestionOptions.pet",
  hometown: "securityQuestionOptions.hometown",
  mothersMaidenName: "securityQuestionOptions.mothersMaidenName",
  elementarySchool: "securityQuestionOptions.elementarySchool",
  childhoodFriend: "securityQuestionOptions.childhoodFriend",
  favoriteBookOrMovie: "securityQuestionOptions.favoriteBookOrMovie",
  firstCar: "securityQuestionOptions.firstCar",
} as const satisfies Record<SecurityQuestionId, string>;

// ---------------------------------------------------------------------------
// Password validation
// ---------------------------------------------------------------------------
//
// Zodのmessageにはi18nキー（auth namespace）を渡す。呼び出し側でt()に通して
// 表示文言へ変換すること（#620：直接日本語を埋め込むとlanguage設定を無視する）。

const ALLOWED_CHARS = /^[a-zA-Z0-9\-_!?#@$%^&*()+={}[\]|;:'",.<>\\/~`]+$/;

export const passwordSchema = z
  .string()
  .min(8, "passwordTooShort")
  .regex(ALLOWED_CHARS, "passwordInvalidChars")
  .refine((val) => {
    let types = 0;
    if (/[a-z]/.test(val)) types++;
    if (/[A-Z]/.test(val)) types++;
    if (/[0-9]/.test(val)) types++;
    if (/[-_!?#@$%^&*()+={}[\]|;:'",.<>\\/~`]/.test(val)) types++;
    return types >= 3;
  }, "passwordWeak");

export const loginSchema = z.object({
  email: z.string().email("emailInvalid"),
  password: z.string().min(1, "passwordRequired"),
});

export const signupSchema = z
  .object({
    email: z.string().email("emailInvalid"),
    password: passwordSchema,
    confirmPassword: z.string(),
    securityQuestion: z.string().min(1, "securityQuestionRequired"),
    securityAnswer: z.string().min(1, "answerRequired"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "confirmPasswordMismatch",
    path: ["confirmPassword"],
  });

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export const sha256hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * SupabaseのAuthエラーメッセージを、表示用のi18nキー（auth namespace）へ変換する。
 * 呼び出し側で t() に通してから表示すること（#620）。
 */
export const translateAuthError = (message: string): string => {
  if (message.includes("over_email_send_rate_limit") || message.includes("email rate limit")) {
    return "emailRateLimitError";
  }
  if (
    message.includes("User already registered") ||
    message.includes("user_already_exists") ||
    message.includes("already been registered")
  ) {
    return "emailAlreadyRegistered";
  }
  if (message.includes("Invalid login credentials") || message.includes("invalid_credentials")) {
    return "invalidCredentials";
  }
  if (message.includes("Email not confirmed")) {
    return "emailNotConfirmed";
  }
  if (message.includes("Password should be at least")) {
    return "supabasePasswordTooShort";
  }
  return "authFailed";
};
