import { describe, expect, test } from "bun:test";

import {
  hasVerifiedTotpFactor,
  isMfaChallengeRequired,
  selectVerifiedTotpFactor,
  totpCodeSchema,
  translateMfaError,
} from "./mfa";

// ---------------------------------------------------------------------------
// totpCodeSchema
// ---------------------------------------------------------------------------

describe("totpCodeSchema", () => {
  test("6桁の数字は成功", () => {
    expect(totpCodeSchema.safeParse("123456").success).toBe(true);
  });

  test("前後の空白はtrimされて成功", () => {
    const result = totpCodeSchema.safeParse("  123456  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("123456");
  });

  test("5桁は失敗", () => {
    expect(totpCodeSchema.safeParse("12345").success).toBe(false);
  });

  test("7桁は失敗", () => {
    expect(totpCodeSchema.safeParse("1234567").success).toBe(false);
  });

  test("数字以外を含む場合は失敗", () => {
    expect(totpCodeSchema.safeParse("12345a").success).toBe(false);
  });

  test("空文字は失敗", () => {
    expect(totpCodeSchema.safeParse("").success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasVerifiedTotpFactor / selectVerifiedTotpFactor
// ---------------------------------------------------------------------------

describe("hasVerifiedTotpFactor", () => {
  test("verifiedなtotp factorが1件あればtrue", () => {
    expect(hasVerifiedTotpFactor([{ id: "1", factorType: "totp", status: "verified" }])).toBe(true);
  });

  test("unverifiedのみの場合はfalse", () => {
    expect(hasVerifiedTotpFactor([{ id: "1", factorType: "totp", status: "unverified" }])).toBe(
      false,
    );
  });

  test("factorが存在しない場合はfalse", () => {
    expect(hasVerifiedTotpFactor([])).toBe(false);
  });

  test("totp以外のfactorTypeは無視される", () => {
    expect(hasVerifiedTotpFactor([{ id: "1", factorType: "phone", status: "verified" }])).toBe(
      false,
    );
  });
});

describe("selectVerifiedTotpFactor", () => {
  test("verifiedなtotp factorを返す", () => {
    const factor = selectVerifiedTotpFactor([
      { id: "1", factorType: "totp", status: "unverified" },
      { id: "2", factorType: "totp", status: "verified" },
    ]);
    expect(factor?.id).toBe("2");
  });

  test("該当がなければnull", () => {
    expect(
      selectVerifiedTotpFactor([{ id: "1", factorType: "totp", status: "unverified" }]),
    ).toBeNull();
  });

  test("複数verifiedがあれば先頭を返す", () => {
    const factor = selectVerifiedTotpFactor([
      { id: "1", factorType: "totp", status: "verified" },
      { id: "2", factorType: "totp", status: "verified" },
    ]);
    expect(factor?.id).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// isMfaChallengeRequired
// ---------------------------------------------------------------------------

describe("isMfaChallengeRequired", () => {
  test("nextLevelがaal2でcurrentLevelがaal1ならtrue（チャレンジ必要）", () => {
    expect(isMfaChallengeRequired({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
  });

  test("currentLevelとnextLevelが共にaal2ならfalse（完了済み）", () => {
    expect(isMfaChallengeRequired({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
  });

  test("nextLevelがaal1（MFA未設定）ならfalse", () => {
    expect(isMfaChallengeRequired({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
  });

  test("nullが渡された場合はfalse", () => {
    expect(isMfaChallengeRequired(null)).toBe(false);
  });

  test("undefinedが渡された場合はfalse", () => {
    expect(isMfaChallengeRequired(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// translateMfaError
// ---------------------------------------------------------------------------

describe("translateMfaError", () => {
  test("Invalid TOTP code", () => {
    expect(translateMfaError("Invalid TOTP code entered")).toContain("正しくないか");
  });

  test("invalid_code", () => {
    expect(translateMfaError("invalid_code")).toContain("正しくないか");
  });

  test("rate limit", () => {
    expect(translateMfaError("over_email_send_rate_limit")).toContain("リクエストが多すぎます");
  });

  test("factor not found", () => {
    expect(translateMfaError("mfa_factor_not_found")).toContain("認証情報が見つかりません");
  });

  test("未知のエラーはそのまま返す", () => {
    const msg = "Some unexpected mfa error";
    expect(translateMfaError(msg)).toBe(msg);
  });
});
