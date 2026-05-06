import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SECURITY_QUESTIONS = [
  "初めて飼ったペットの名前は？",
  "幼少期に住んでいた街の名前は？",
  "母親の旧姓は？",
  "最初に通った小学校の名前は？",
  "子どもの頃の親友の名前は？",
  "好きな本や映画のタイトルは？",
  "初めての車のメーカーは？",
] as const;

// ---------------------------------------------------------------------------
// Password validation
// ---------------------------------------------------------------------------

const ALLOWED_CHARS = /^[a-zA-Z0-9\-_!?#@$%^&*()+={}[\]|;:'",.<>\\/~`]+$/;

export const passwordSchema = z
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

export const loginSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

export const signupSchema = z
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export const sha256hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const translateAuthError = (message: string): string => {
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
