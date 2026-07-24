import { describe, expect, test } from "bun:test";

import { loginSchema, passwordSchema, sha256hex, signupSchema, translateAuthError } from "./auth";

// ---------------------------------------------------------------------------
// translateAuthError
// ---------------------------------------------------------------------------

describe("translateAuthError", () => {
  // #620: 表示文言のハードコードをやめ、i18nキー（auth namespace）を返すように
  // 変更した。呼び出し側で t() に通してから表示する。

  test("rate limit error (over_email_send_rate_limit)", () => {
    expect(translateAuthError("over_email_send_rate_limit")).toBe("emailRateLimitError");
  });

  test("rate limit error (email rate limit)", () => {
    expect(translateAuthError("email rate limit exceeded")).toBe("emailRateLimitError");
  });

  test("already registered (User already registered)", () => {
    expect(translateAuthError("User already registered")).toBe("emailAlreadyRegistered");
  });

  test("already registered (user_already_exists)", () => {
    expect(translateAuthError("user_already_exists")).toBe("emailAlreadyRegistered");
  });

  test("already registered (already been registered)", () => {
    expect(translateAuthError("Email has already been registered")).toBe("emailAlreadyRegistered");
  });

  test("invalid credentials (Invalid login credentials)", () => {
    expect(translateAuthError("Invalid login credentials")).toBe("invalidCredentials");
  });

  test("invalid credentials (invalid_credentials)", () => {
    expect(translateAuthError("invalid_credentials")).toBe("invalidCredentials");
  });

  test("email not confirmed", () => {
    expect(translateAuthError("Email not confirmed")).toBe("emailNotConfirmed");
  });

  test("password too short (Supabase message)", () => {
    expect(translateAuthError("Password should be at least 6 characters")).toBe(
      "supabasePasswordTooShort",
    );
  });

  test("unknown error falls back to the generic authFailed key", () => {
    expect(translateAuthError("Some unexpected error")).toBe("authFailed");
  });
});

// ---------------------------------------------------------------------------
// passwordSchema
// ---------------------------------------------------------------------------

describe("passwordSchema — 長さ", () => {
  test("7文字は失敗", () => {
    expect(passwordSchema.safeParse("Abcd1!x").success).toBe(false);
  });

  test("8文字は成功（他の条件を満たす場合）", () => {
    expect(passwordSchema.safeParse("Abcd1!xy").success).toBe(true);
  });
});

describe("passwordSchema — 使用可能文字", () => {
  test("全角文字は失敗", () => {
    expect(passwordSchema.safeParse("Ａｂｃｄ1!xy").success).toBe(false);
  });

  test("スペースは失敗", () => {
    expect(passwordSchema.safeParse("Abcd 1!xy").success).toBe(false);
  });
});

describe("passwordSchema — 3種類以上ルール", () => {
  test("小文字のみ8文字は失敗（1種類）", () => {
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(false);
  });

  test("小文字＋数字のみは失敗（2種類）", () => {
    expect(passwordSchema.safeParse("abcdef12").success).toBe(false);
  });

  test("小文字＋大文字＋数字は成功（3種類）", () => {
    expect(passwordSchema.safeParse("abcdEF12").success).toBe(true);
  });

  test("小文字＋大文字＋記号は成功（3種類）", () => {
    expect(passwordSchema.safeParse("abcdEFGH!").success).toBe(true);
  });

  test("小文字＋数字＋記号は成功（3種類）", () => {
    expect(passwordSchema.safeParse("abcdef1!").success).toBe(true);
  });

  test("大文字＋数字＋記号は成功（3種類）", () => {
    expect(passwordSchema.safeParse("ABCDEF1!").success).toBe(true);
  });

  test("4種類すべては成功", () => {
    expect(passwordSchema.safeParse("Abcdef1!").success).toBe(true);
  });
});

describe("passwordSchema — エラーメッセージ（#620: i18nキーを返す）", () => {
  test("短すぎる場合はpasswordTooShortキー", () => {
    const result = passwordSchema.safeParse("Ab1!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "passwordTooShort")).toBe(true);
    }
  });

  test("種類不足の場合はpasswordWeakキー", () => {
    const result = passwordSchema.safeParse("abcdefgh");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "passwordWeak")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------

describe("loginSchema", () => {
  test("正常なメール＋パスワードは成功", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "anypass" }).success).toBe(
      true,
    );
  });

  test("不正なメール形式は失敗", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "anypass" }).success).toBe(
      false,
    );
  });

  test("空パスワードは失敗", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signupSchema — パスワード一致チェック
// ---------------------------------------------------------------------------

describe("signupSchema — confirmPassword", () => {
  const base = {
    email: "user@example.com",
    password: "Abcdef1!",
    securityQuestion: "初めて飼ったペットの名前は？",
    securityAnswer: "ポチ",
  };

  test("パスワードが一致すれば成功", () => {
    expect(signupSchema.safeParse({ ...base, confirmPassword: "Abcdef1!" }).success).toBe(true);
  });

  test("パスワードが不一致なら失敗", () => {
    const result = signupSchema.safeParse({ ...base, confirmPassword: "Different1!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "confirmPasswordMismatch")).toBe(true);
    }
  });

  test("秘密の質問が空なら失敗", () => {
    expect(
      signupSchema.safeParse({ ...base, confirmPassword: "Abcdef1!", securityQuestion: "" })
        .success,
    ).toBe(false);
  });

  test("秘密の答えが空なら失敗", () => {
    expect(
      signupSchema.safeParse({ ...base, confirmPassword: "Abcdef1!", securityAnswer: "" }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sha256hex
// ---------------------------------------------------------------------------

describe("sha256hex", () => {
  test("同じ入力は常に同じハッシュを返す", async () => {
    const a = await sha256hex("hello");
    const b = await sha256hex("hello");
    expect(a).toBe(b);
  });

  test("異なる入力は異なるハッシュを返す", async () => {
    const a = await sha256hex("hello");
    const b = await sha256hex("world");
    expect(a).not.toBe(b);
  });

  test("大文字小文字は区別される（正規化は呼び出し側の責務）", async () => {
    const lower = await sha256hex("hello");
    const upper = await sha256hex("HELLO");
    expect(lower).not.toBe(upper);
  });

  test("出力は64文字の16進数文字列", async () => {
    const hash = await sha256hex("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("既知のハッシュ値（hello の SHA-256）", async () => {
    const hash = await sha256hex("hello");
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});
