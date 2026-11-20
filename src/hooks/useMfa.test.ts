import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface MfaResult {
  data: unknown;
  error: unknown;
}

let listFactorsResult: MfaResult = { data: { totp: [] }, error: null };
let enrollResult: MfaResult = { data: null, error: null };
let challengeResult: MfaResult = { data: { id: "ch-1" }, error: null };
let verifyResult: MfaResult = { data: {}, error: null };
let unenrollResult: MfaResult = { data: {}, error: null };

const listFactorsMock = mock(() => Promise.resolve(listFactorsResult));
const enrollMock = mock<(args: unknown) => Promise<MfaResult>>(() => Promise.resolve(enrollResult));
const challengeMock = mock<(args: unknown) => Promise<MfaResult>>(() =>
  Promise.resolve(challengeResult),
);
const verifyMock = mock<(args: unknown) => Promise<MfaResult>>(() => Promise.resolve(verifyResult));
const unenrollMock = mock<(args: unknown) => Promise<MfaResult>>(() =>
  Promise.resolve(unenrollResult),
);

mock.module("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: listFactorsMock,
        enroll: enrollMock,
        challenge: challengeMock,
        verify: verifyMock,
        unenroll: unenrollMock,
      },
    },
  },
}));

mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const { useEnrollTotp, useMfaFactors, useUnenrollTotp, useVerifyTotpEnrollment } =
  await import("@/hooks/useMfa");

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
};

beforeEach(() => {
  listFactorsResult = { data: { totp: [] }, error: null };
  enrollResult = { data: null, error: null };
  challengeResult = { data: { id: "ch-1" }, error: null };
  verifyResult = { data: {}, error: null };
  unenrollResult = { data: {}, error: null };
  for (const m of [listFactorsMock, enrollMock, challengeMock, verifyMock, unenrollMock]) {
    m.mockClear();
  }
});

describe("useMfaFactors", () => {
  test("TOTP ファクターを MfaFactorSummary に変換して返す", async () => {
    listFactorsResult = {
      data: { totp: [{ id: "f1", factor_type: "totp", status: "verified", extra: 1 }] },
      error: null,
    };
    const { result } = renderHook(() => useMfaFactors(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "f1", factorType: "totp", status: "verified" }]);
  });

  test("listFactors がエラーを返すと error 状態になる", async () => {
    listFactorsResult = { data: null, error: new Error("boom") };
    const { result } = renderHook(() => useMfaFactors(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useEnrollTotp", () => {
  test("enroll の結果を factorId / qrCodeUri / secret にマップする", async () => {
    enrollResult = {
      data: { id: "f1", totp: { uri: "otpauth://x", secret: "SECRET" } },
      error: null,
    };
    const { result } = renderHook(() => useEnrollTotp(), { wrapper: makeWrapper() });
    const enrollment = await result.current.mutateAsync();
    expect(enrollment).toEqual({ factorId: "f1", qrCodeUri: "otpauth://x", secret: "SECRET" });
    expect(enrollMock).toHaveBeenCalledWith({ factorType: "totp", issuer: "Housekeeper" });
  });

  test("enroll がエラーなら reject する", async () => {
    enrollResult = { data: null, error: new Error("enroll failed") };
    const { result } = renderHook(() => useEnrollTotp(), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync()).rejects.toThrow("enroll failed");
  });
});

describe("useVerifyTotpEnrollment", () => {
  test("challenge → verify の順に呼び、challengeId を引き継ぐ", async () => {
    const { result } = renderHook(() => useVerifyTotpEnrollment(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ factorId: "f1", code: "123456" });
    expect(challengeMock).toHaveBeenCalledWith({ factorId: "f1" });
    expect(verifyMock).toHaveBeenCalledWith({
      factorId: "f1",
      challengeId: "ch-1",
      code: "123456",
    });
  });

  test("challenge が失敗したら verify を呼ばない", async () => {
    challengeResult = { data: null, error: new Error("challenge failed") };
    const { result } = renderHook(() => useVerifyTotpEnrollment(), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync({ factorId: "f1", code: "1" })).rejects.toThrow(
      "challenge failed",
    );
    expect(verifyMock).not.toHaveBeenCalled();
  });

  test("verify が失敗したら reject する", async () => {
    verifyResult = { data: null, error: new Error("invalid code") };
    const { result } = renderHook(() => useVerifyTotpEnrollment(), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync({ factorId: "f1", code: "0" })).rejects.toThrow(
      "invalid code",
    );
  });
});

describe("useUnenrollTotp", () => {
  test("factorId を指定して unenroll を呼ぶ", async () => {
    const { result } = renderHook(() => useUnenrollTotp(), { wrapper: makeWrapper() });
    await result.current.mutateAsync("f1");
    expect(unenrollMock).toHaveBeenCalledWith({ factorId: "f1" });
  });

  test("unenroll がエラーなら reject する", async () => {
    unenrollResult = { data: null, error: new Error("unenroll failed") };
    const { result } = renderHook(() => useUnenrollTotp(), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync("f1")).rejects.toThrow("unenroll failed");
  });
});
