import assert from "node:assert/strict";

import { buildSearchKeyword, fetchRecipeSuggestions, shapeRecipeSuggestions } from "./recipe.ts";

// --- buildSearchKeyword ---

Deno.test("buildSearchKeyword - joins item names with a space", () => {
  assert.strictEqual(buildSearchKeyword(["牛乳", "卵"]), "牛乳 卵");
});

Deno.test("buildSearchKeyword - handles a single item", () => {
  assert.strictEqual(buildSearchKeyword(["牛乳"]), "牛乳");
});

// --- shapeRecipeSuggestions ---

Deno.test("shapeRecipeSuggestions - shapes valid hits", () => {
  const json = {
    result: [
      {
        recipeId: 12345,
        recipeTitle: "牛乳と卵のフレンチトースト",
        recipeUrl: "https://recipe.rakuten.co.jp/recipe/12345/",
        foodImageUrl: "https://image.rakuten.co.jp/12345.jpg",
      },
    ],
  };
  assert.deepStrictEqual(shapeRecipeSuggestions(json), [
    {
      id: "12345",
      title: "牛乳と卵のフレンチトースト",
      url: "https://recipe.rakuten.co.jp/recipe/12345/",
      imageUrl: "https://image.rakuten.co.jp/12345.jpg",
    },
  ]);
});

Deno.test("shapeRecipeSuggestions - falls back to the URL as id when recipeId is missing", () => {
  const json = {
    result: [{ recipeTitle: "卵焼き", recipeUrl: "https://recipe.rakuten.co.jp/recipe/1/" }],
  };
  const [suggestion] = shapeRecipeSuggestions(json);
  assert.strictEqual(suggestion?.id, "https://recipe.rakuten.co.jp/recipe/1/");
  assert.strictEqual(suggestion?.imageUrl, null);
});

Deno.test("shapeRecipeSuggestions - skips hits missing a title or url", () => {
  const json = {
    result: [
      { recipeTitle: "タイトルのみ" },
      { recipeUrl: "https://recipe.rakuten.co.jp/recipe/2/" },
      { recipeTitle: "", recipeUrl: "https://recipe.rakuten.co.jp/recipe/3/" },
      { recipeTitle: "有効", recipeUrl: "https://recipe.rakuten.co.jp/recipe/4/" },
    ],
  };
  assert.deepStrictEqual(
    shapeRecipeSuggestions(json).map((s) => s.title),
    ["有効"],
  );
});

Deno.test("shapeRecipeSuggestions - caps to the given limit", () => {
  const json = {
    result: Array.from({ length: 10 }, (_, i) => ({
      recipeId: i,
      recipeTitle: `レシピ${i}`,
      recipeUrl: `https://recipe.rakuten.co.jp/recipe/${i}/`,
    })),
  };
  assert.strictEqual(shapeRecipeSuggestions(json, 3).length, 3);
  assert.strictEqual(shapeRecipeSuggestions(json).length, 6);
});

Deno.test("shapeRecipeSuggestions - returns [] for non-object/null json", () => {
  assert.deepStrictEqual(shapeRecipeSuggestions(null), []);
  assert.deepStrictEqual(shapeRecipeSuggestions(undefined), []);
  assert.deepStrictEqual(shapeRecipeSuggestions("not json"), []);
  assert.deepStrictEqual(shapeRecipeSuggestions(42), []);
});

Deno.test("shapeRecipeSuggestions - returns [] when result is missing or not an array", () => {
  assert.deepStrictEqual(shapeRecipeSuggestions({}), []);
  assert.deepStrictEqual(shapeRecipeSuggestions({ result: "oops" }), []);
});

// --- fetchRecipeSuggestions ---

Deno.test("fetchRecipeSuggestions - degrades gracefully when RECIPE_API_KEY is unset", async () => {
  let fetchCalled = false;
  const fetchImpl = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], { apiKey: undefined, fetchImpl });

  assert.deepStrictEqual(result, { kind: "missing_key" });
  // Missing key must short-circuit before ever calling the external API.
  assert.strictEqual(fetchCalled, false);
});

Deno.test("fetchRecipeSuggestions - short-circuits to an empty ok result with no item names", async () => {
  let fetchCalled = false;
  const fetchImpl = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  const result = await fetchRecipeSuggestions([], { apiKey: "test-key", fetchImpl });

  assert.deepStrictEqual(result, { kind: "ok", recipes: [] });
  assert.strictEqual(fetchCalled, false);
});

Deno.test("fetchRecipeSuggestions - shapes a successful response using the injected fetch", async () => {
  const fetchImpl = ((input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.strictEqual(url.searchParams.get("applicationId"), "test-key");
    assert.strictEqual(url.searchParams.get("keyword"), "牛乳 卵");
    return Promise.resolve(
      new Response(
        JSON.stringify({
          result: [
            {
              recipeId: 1,
              recipeTitle: "卵と牛乳のプリン",
              recipeUrl: "https://recipe.rakuten.co.jp/recipe/1/",
              foodImageUrl: "https://image.rakuten.co.jp/1.jpg",
            },
          ],
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳", "卵"], { apiKey: "test-key", fetchImpl });

  assert.strictEqual(result.kind, "ok");
  if (result.kind === "ok") {
    assert.strictEqual(result.recipes.length, 1);
    assert.strictEqual(result.recipes[0]?.title, "卵と牛乳のプリン");
  }
});

Deno.test("fetchRecipeSuggestions - returns a soft error when the API responds non-OK", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response("Internal Server Error", { status: 500 }))) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], { apiKey: "test-key", fetchImpl });

  assert.deepStrictEqual(result, { kind: "error" });
});

Deno.test("fetchRecipeSuggestions - returns a soft error when fetch throws", async () => {
  const fetchImpl = (() => Promise.reject(new Error("network down"))) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], { apiKey: "test-key", fetchImpl });

  assert.deepStrictEqual(result, { kind: "error" });
});

Deno.test("fetchRecipeSuggestions - forwards an active AbortSignal to fetchImpl (timeout guard wiring)", async () => {
  let receivedSignal: AbortSignal | undefined;
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) => {
    receivedSignal = init?.signal ?? undefined;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  await fetchRecipeSuggestions(["牛乳"], { apiKey: "test-key", fetchImpl });

  // Confirms the 8s timeout guard is actually wired to the request (an
  // AbortController's signal is passed through), not just present in name —
  // without waiting out the real timeout, which would make this test slow.
  assert.ok(receivedSignal instanceof AbortSignal);
  assert.strictEqual(receivedSignal?.aborted, false);
});

Deno.test("fetchRecipeSuggestions - returns a soft error when the request is aborted (timeout)", async () => {
  // Simulates what fetchImpl actually does when the internal 8s timeout
  // guard fires and aborts its signal: the underlying fetch call rejects
  // with an AbortError. Confirms that specific rejection is caught by the
  // same soft-degradation path as any other fetch failure, rather than
  // waiting out the real 8s timeout (which would make this test slow).
  const fetchImpl = (() =>
    Promise.reject(new DOMException("The signal has been aborted", "AbortError"))) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], { apiKey: "test-key", fetchImpl });

  assert.deepStrictEqual(result, { kind: "error" });
});
