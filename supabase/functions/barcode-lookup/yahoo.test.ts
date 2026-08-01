import assert from "node:assert/strict";

import { fetchYahooShoppingProduct } from "./yahoo.ts";

// --- fetchYahooShoppingProduct ---

Deno.test("fetchYahooShoppingProduct - shapes a successful response with a hit", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.strictEqual(url.searchParams.get("appid"), "test-app-id");
    assert.strictEqual(url.searchParams.get("jan_code"), "4901234567894");
    return Promise.resolve(
      new Response(
        JSON.stringify({
          totalResultsReturned: 1,
          hits: [
            {
              name: "牛乳",
              description: "説明文",
              image: { medium: "https://example.com/milk.jpg" },
              brand: { name: "メーカー" },
            },
          ],
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;

  const result = await fetchYahooShoppingProduct({
    appId: "test-app-id",
    barcode: "4901234567894",
    fetchImpl,
  });

  assert.deepStrictEqual(result, {
    kind: "ok",
    product: {
      name: "牛乳",
      description: "説明文",
      image_url: "https://example.com/milk.jpg",
      brand: "メーカー",
    },
  });
});

Deno.test("fetchYahooShoppingProduct - returns ok/null when there are no hits", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ totalResultsReturned: 0, hits: [] }), { status: 200 }),
    )) as typeof fetch;

  const result = await fetchYahooShoppingProduct({
    appId: "test-app-id",
    barcode: "4901234567894",
    fetchImpl,
  });

  assert.deepStrictEqual(result, { kind: "ok", product: null });
});

Deno.test("fetchYahooShoppingProduct - returns a soft error when the API responds non-OK", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response("Internal Server Error", { status: 500 }))) as typeof fetch;

  const result = await fetchYahooShoppingProduct({
    appId: "test-app-id",
    barcode: "4901234567894",
    fetchImpl,
  });

  assert.deepStrictEqual(result, { kind: "error" });
});

Deno.test("fetchYahooShoppingProduct - returns a soft error when fetch throws", async () => {
  const fetchImpl = (() => Promise.reject(new Error("network down"))) as typeof fetch;

  const result = await fetchYahooShoppingProduct({
    appId: "test-app-id",
    barcode: "4901234567894",
    fetchImpl,
  });

  assert.deepStrictEqual(result, { kind: "error" });
});

Deno.test("fetchYahooShoppingProduct - forwards an active AbortSignal to fetchImpl (timeout guard wiring)", async () => {
  let receivedSignal: AbortSignal | undefined;
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) => {
    receivedSignal = init?.signal ?? undefined;
    return Promise.resolve(new Response(JSON.stringify({ hits: [] }), { status: 200 }));
  }) as typeof fetch;

  await fetchYahooShoppingProduct({ appId: "test-app-id", barcode: "4901234567894", fetchImpl });

  // Confirms the timeout guard is actually wired to the request (an
  // AbortController's signal is passed through), not just present in name —
  // without waiting out the real timeout, which would make this test slow.
  assert.ok(receivedSignal instanceof AbortSignal);
  assert.strictEqual(receivedSignal?.aborted, false);
});

Deno.test("fetchYahooShoppingProduct - returns kind:timeout when the request is aborted", async () => {
  // Simulates what fetchImpl actually does when the internal timeout guard
  // fires and aborts its signal: the underlying fetch call rejects with an
  // AbortError. Confirms that specific rejection is classified distinctly
  // from a generic network error (#709), rather than waiting out the real
  // 8s timeout (which would make this test slow).
  const fetchImpl = (() =>
    Promise.reject(new DOMException("The signal has been aborted", "AbortError"))) as typeof fetch;

  const result = await fetchYahooShoppingProduct({
    appId: "test-app-id",
    barcode: "4901234567894",
    fetchImpl,
  });

  assert.deepStrictEqual(result, { kind: "timeout" });
});

Deno.test("fetchYahooShoppingProduct - actually aborts fetchImpl once timeoutMs elapses", async () => {
  // Uses a short timeoutMs (instead of the real 8s default) plus a fetchImpl
  // that hangs until its signal aborts, so this test verifies the
  // setTimeout -> controller.abort() wiring end-to-end without being slow.
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The signal has been aborted", "AbortError"));
      });
    });
  }) as typeof fetch;

  const result = await fetchYahooShoppingProduct({
    appId: "test-app-id",
    barcode: "4901234567894",
    fetchImpl,
    timeoutMs: 10,
  });

  assert.deepStrictEqual(result, { kind: "timeout" });
});
