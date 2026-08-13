import { FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, mock, test } from "bun:test";

import { OfflineError } from "@/lib/requireOnline";

interface InvokeResponse {
  data: unknown;
  error: unknown;
}

let invokeResponse: InvokeResponse = { data: { items: [] }, error: null };
const invokeMock = mock(() => Promise.resolve(invokeResponse));

mock.module("@/lib/supabase", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

const { ReceiptScanError, receiptScanErrorMessageKey, scanReceipt } =
  await import("@/hooks/useReceiptScan");

const makeFile = (type: string, name = "receipt.jpg") =>
  new File(["dummy-image-bytes"], name, { type });

describe("scanReceipt", () => {
  test("rejects unsupported mime types without calling the Edge Function", async () => {
    invokeMock.mockClear();
    const file = makeFile("application/pdf");

    await expect(scanReceipt(file)).rejects.toThrow();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("sends the file as base64 (without the data-URL prefix) and the file's mimeType", async () => {
    invokeMock.mockClear();
    invokeResponse = {
      data: { items: [{ name: "牛乳", quantity: 1, unitPrice: 200, confidence: "high" }] },
      error: null,
    };
    const file = makeFile("image/png");

    const result = await scanReceipt(file);

    expect(result).toEqual([{ name: "牛乳", quantity: 1, unitPrice: 200, confidence: "high" }]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const call = invokeMock.mock.calls[0] as unknown as [
      string,
      { body: { image: string; mimeType: string } },
    ];
    expect(call[0]).toBe("receipt-scan");
    expect(call[1].body.mimeType).toBe("image/png");
    // No "data:...;base64," prefix should leak through to the request body.
    expect(call[1].body.image.startsWith("data:")).toBe(false);
    expect(call[1].body.image.length).toBeGreaterThan(0);
  });

  test("returns an empty array when the response has no items", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: null };

    const result = await scanReceipt(makeFile("image/jpeg"));
    expect(result).toEqual([]);
  });

  test("maps a 429 response to a rate_limited ReceiptScanError", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 429 }) };

    await expect(scanReceipt(makeFile("image/jpeg"))).rejects.toMatchObject({
      name: "ReceiptScanError",
      kind: "rate_limited",
    });
  });

  test("maps a 504 response to a timeout ReceiptScanError", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 504 }) };

    await expect(scanReceipt(makeFile("image/jpeg"))).rejects.toMatchObject({
      name: "ReceiptScanError",
      kind: "timeout",
    });
  });

  test("maps any other error to a server_error ReceiptScanError", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 500 }) };

    await expect(scanReceipt(makeFile("image/jpeg"))).rejects.toMatchObject({
      name: "ReceiptScanError",
      kind: "server_error",
    });
  });
});

describe("receiptScanErrorMessageKey", () => {
  test("maps OfflineError to offlineError", () => {
    expect(receiptScanErrorMessageKey(new OfflineError())).toBe("offlineError");
  });

  test("maps each ReceiptScanError kind to its message key", () => {
    expect(receiptScanErrorMessageKey(new ReceiptScanError("unsupported_type"))).toBe(
      "unsupportedType",
    );
    expect(receiptScanErrorMessageKey(new ReceiptScanError("rate_limited"))).toBe("rateLimited");
    expect(receiptScanErrorMessageKey(new ReceiptScanError("timeout"))).toBe("timeout");
    expect(receiptScanErrorMessageKey(new ReceiptScanError("server_error"))).toBe("scanError");
  });

  test("falls back to scanError for unrecognized errors", () => {
    expect(receiptScanErrorMessageKey(new Error("boom"))).toBe("scanError");
  });
});
