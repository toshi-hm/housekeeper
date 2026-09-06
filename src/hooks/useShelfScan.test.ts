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

const { ShelfScanError, shelfScanErrorMessageKey, scanShelfPhoto } =
  await import("@/hooks/useShelfScan");

const makeFile = (type: string, name = "shelf.jpg") =>
  new File(["dummy-image-bytes"], name, { type });

describe("scanShelfPhoto", () => {
  test("rejects unsupported mime types without calling the Edge Function", async () => {
    invokeMock.mockClear();
    const file = makeFile("application/pdf");

    await expect(scanShelfPhoto(file)).rejects.toThrow();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("sends the file as base64 (without the data-URL prefix) and the file's mimeType", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: { items: ["牛乳", "卵"] }, error: null };
    const file = makeFile("image/png");

    const result = await scanShelfPhoto(file);

    expect(result).toEqual({ items: ["牛乳", "卵"] });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const call = invokeMock.mock.calls[0] as unknown as [
      string,
      { body: { image: string; mimeType: string } },
    ];
    expect(call[0]).toBe("shelf-scan");
    expect(call[1].body.mimeType).toBe("image/png");
    // No "data:...;base64," prefix should leak through to the request body.
    expect(call[1].body.image.startsWith("data:")).toBe(false);
    expect(call[1].body.image.length).toBeGreaterThan(0);
  });

  test("returns an empty array when the response is empty", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: null };

    const result = await scanShelfPhoto(makeFile("image/jpeg"));
    expect(result).toEqual({ items: [] });
  });

  test("maps a 429 response to a rate_limited ShelfScanError", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 429 }) };

    await expect(scanShelfPhoto(makeFile("image/jpeg"))).rejects.toMatchObject({
      name: "ShelfScanError",
      kind: "rate_limited",
    });
  });

  test("maps a 504 response to a timeout ShelfScanError", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 504 }) };

    await expect(scanShelfPhoto(makeFile("image/jpeg"))).rejects.toMatchObject({
      name: "ShelfScanError",
      kind: "timeout",
    });
  });

  test("maps a 413 response to an image_too_large ShelfScanError", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 413 }) };

    await expect(scanShelfPhoto(makeFile("image/jpeg"))).rejects.toMatchObject({
      name: "ShelfScanError",
      kind: "image_too_large",
    });
  });

  test("maps any other error to a server_error ShelfScanError", async () => {
    invokeMock.mockClear();
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 500 }) };

    await expect(scanShelfPhoto(makeFile("image/jpeg"))).rejects.toMatchObject({
      name: "ShelfScanError",
      kind: "server_error",
    });
  });
});

describe("shelfScanErrorMessageKey", () => {
  test("maps OfflineError to offlineError", () => {
    expect(shelfScanErrorMessageKey(new OfflineError())).toBe("offlineError");
  });

  test("maps each ShelfScanError kind to its message key", () => {
    expect(shelfScanErrorMessageKey(new ShelfScanError("unsupported_type"))).toBe(
      "unsupportedType",
    );
    expect(shelfScanErrorMessageKey(new ShelfScanError("rate_limited"))).toBe("rateLimited");
    expect(shelfScanErrorMessageKey(new ShelfScanError("timeout"))).toBe("timeout");
    expect(shelfScanErrorMessageKey(new ShelfScanError("image_too_large"))).toBe("imageTooLarge");
    expect(shelfScanErrorMessageKey(new ShelfScanError("server_error"))).toBe("scanError");
  });

  test("falls back to scanError for unrecognized errors", () => {
    expect(shelfScanErrorMessageKey(new Error("boom"))).toBe("scanError");
  });
});
