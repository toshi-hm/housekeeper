import assert from "node:assert/strict";

import {
  DEFAULT_RECIPE_API_BASE_URL,
  DEFAULT_RECIPE_CATEGORY_LIST_URL,
  fetchRecipeSuggestions,
  shapeRecipeSuggestions,
} from "./recipe.ts";

const credentials = { apiKey: "test-app-id", accessKey: "test-access-key" };

Deno.test("Rakuten endpoints use the current openapi host", () => {
  assert.strictEqual(
    DEFAULT_RECIPE_API_BASE_URL,
    "https://openapi.rakuten.co.jp/recipems/api/Recipe/CategoryRanking/20170426",
  );
  assert.strictEqual(
    DEFAULT_RECIPE_CATEGORY_LIST_URL,
    "https://openapi.rakuten.co.jp/recipems/api/Recipe/CategoryList/20170426",
  );
});

Deno.test("shapeRecipeSuggestions filters by recipe materials and caps results", () => {
  const json = {
    result: [
      {
        recipeId: 12345,
        recipeTitle: "牛乳と卵のプリン",
        recipeUrl: "https://recipe.rakuten.co.jp/recipe/12345/",
        foodImageUrl: "https://image.rakuten.co.jp/12345.jpg",
        recipeMaterial: ["牛乳", "卵", "砂糖"],
      },
      {
        recipeId: 22,
        recipeTitle: "牛乳を使わないパン",
        recipeUrl: "https://recipe.rakuten.co.jp/recipe/22/",
        recipeMaterial: ["強力粉", "水", "塩"],
      },
    ],
  };

  assert.deepStrictEqual(shapeRecipeSuggestions(json, ["牛乳", "卵"]), [
    {
      id: "12345",
      title: "牛乳と卵のプリン",
      url: "https://recipe.rakuten.co.jp/recipe/12345/",
      imageUrl: "https://image.rakuten.co.jp/12345.jpg",
    },
  ]);
});

Deno.test("shapeRecipeSuggestions supports ingredient objects and falls back to URL ids", () => {
  const [suggestion] = shapeRecipeSuggestions(
    {
      result: [
        {
          recipeTitle: "卵焼き",
          recipeUrl: "https://recipe.rakuten.co.jp/recipe/1/",
          recipeMaterial: [{ name: "卵 2個" }, { material: "塩" }],
        },
      ],
    },
    ["卵"],
  );

  assert.strictEqual(suggestion?.id, "https://recipe.rakuten.co.jp/recipe/1/");
  assert.strictEqual(suggestion?.imageUrl, null);
});

Deno.test("shapeRecipeSuggestions returns no recipes without a matching ingredient", () => {
  assert.deepStrictEqual(
    shapeRecipeSuggestions(
      {
        result: [
          {
            recipeId: 7,
            recipeTitle: "カレー",
            recipeUrl: "https://recipe.rakuten.co.jp/recipe/7/",
            recipeMaterial: ["牛肉", "じゃがいも"],
          },
        ],
      },
      ["牛乳"],
    ),
    [],
  );
});

Deno.test("shapeRecipeSuggestions returns [] for malformed API responses", () => {
  assert.deepStrictEqual(shapeRecipeSuggestions(null, ["牛乳"]), []);
  assert.deepStrictEqual(shapeRecipeSuggestions({ result: "oops" }, ["牛乳"]), []);
  assert.deepStrictEqual(
    shapeRecipeSuggestions({ result: [null, {}, { recipeTitle: "no URL" }] }, ["牛乳"]),
    [],
  );
});

Deno.test("fetchRecipeSuggestions does not call Rakuten without the existing App ID", async () => {
  let fetchCalled = false;
  const fetchImpl = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], {
    apiKey: undefined,
    accessKey: credentials.accessKey,
    fetchImpl,
  });

  assert.deepStrictEqual(result, { kind: "missing_api_key" });
  assert.strictEqual(fetchCalled, false);
});

Deno.test("fetchRecipeSuggestions clearly reports a missing access key before any API call", async () => {
  let fetchCalled = false;
  const fetchImpl = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], {
    apiKey: credentials.apiKey,
    accessKey: undefined,
    fetchImpl,
  });

  assert.deepStrictEqual(result, { kind: "missing_access_key" });
  assert.strictEqual(fetchCalled, false);
});

Deno.test("fetchRecipeSuggestions short-circuits with valid credentials and no item names", async () => {
  let fetchCalled = false;
  const fetchImpl = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  const result = await fetchRecipeSuggestions([], { ...credentials, fetchImpl });

  assert.deepStrictEqual(result, { kind: "ok", recipes: [] });
  assert.strictEqual(fetchCalled, false);
});

Deno.test("fetchRecipeSuggestions requests matching category rankings and filters materials locally", async () => {
  const requestedUrls: URL[] = [];
  const requestHeaders: Headers[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const requestUrl = new URL(input instanceof Request ? input.url : input);
    requestedUrls.push(requestUrl);
    requestHeaders.push(new Headers(init?.headers));

    if (requestUrl.pathname === "/list") {
      return Promise.resolve(
        Response.json({
          result: {
            large: [
              {
                categoryId: "10",
                categoryName: "牛乳・乳製品",
                medium: [{ categoryId: "10-1", categoryName: "たまご", small: [] }],
              },
            ],
          },
        }),
      );
    }

    const categoryId = requestUrl.searchParams.get("categoryId");
    return Promise.resolve(
      Response.json({
        result:
          categoryId === "10"
            ? [
                {
                  recipeId: 1,
                  recipeTitle: "牛乳プリン",
                  recipeUrl: "https://recipe.rakuten.co.jp/recipe/1/",
                  recipeMaterial: ["牛乳", "砂糖"],
                },
                {
                  recipeId: 2,
                  recipeTitle: "別の人気料理",
                  recipeUrl: "https://recipe.rakuten.co.jp/recipe/2/",
                  recipeMaterial: ["小麦粉", "水"],
                },
              ]
            : [
                {
                  recipeId: 3,
                  recipeTitle: "たまご料理",
                  recipeUrl: "https://recipe.rakuten.co.jp/recipe/3/",
                  recipeMaterial: ["卵", "しょうゆ"],
                },
              ],
      }),
    );
  }) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳 1L", "卵"], {
    ...credentials,
    fetchImpl,
    categoryListUrl: "https://example.test/list",
    rankingUrl: "https://example.test/ranking",
  });

  assert.deepStrictEqual(result, {
    kind: "ok",
    recipes: [
      {
        id: "3",
        title: "たまご料理",
        url: "https://recipe.rakuten.co.jp/recipe/3/",
        imageUrl: null,
      },
      {
        id: "1",
        title: "牛乳プリン",
        url: "https://recipe.rakuten.co.jp/recipe/1/",
        imageUrl: null,
      },
    ],
  });
  assert.strictEqual(requestedUrls.length, 3);
  assert.strictEqual(requestedUrls[0]?.searchParams.get("applicationId"), credentials.apiKey);
  assert.strictEqual(requestedUrls[0]?.searchParams.has("keyword"), false);
  assert.deepStrictEqual(
    requestedUrls.slice(1).map((url) => url.searchParams.get("categoryId")),
    ["10-1", "10"],
  );
  assert.ok(requestHeaders.every((headers) => headers.get("accessKey") === credentials.accessKey));
});

Deno.test("fetchRecipeSuggestions falls back to overall ranking when category names do not match", async () => {
  const requestedUrls: URL[] = [];
  const fetchImpl = ((input: string | URL | Request) => {
    const requestUrl = new URL(input instanceof Request ? input.url : input);
    requestedUrls.push(requestUrl);
    return Promise.resolve(
      requestUrl.pathname === "/list"
        ? Response.json({ result: { large: [{ categoryId: "10", categoryName: "肉料理" }] } })
        : Response.json({ result: [] }),
    );
  }) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], {
    ...credentials,
    fetchImpl,
    categoryListUrl: "https://example.test/list",
    rankingUrl: "https://example.test/ranking",
  });

  assert.deepStrictEqual(result, { kind: "ok", recipes: [] });
  assert.strictEqual(requestedUrls.length, 2);
  assert.strictEqual(requestedUrls[1]?.searchParams.has("categoryId"), false);
});

Deno.test("fetchRecipeSuggestions degrades to an error result on an API error", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response("Unauthorized", { status: 401 }))) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], { ...credentials, fetchImpl });

  assert.deepStrictEqual(result, { kind: "error" });
});

Deno.test("fetchRecipeSuggestions degrades to an error result when fetch throws", async () => {
  const fetchImpl = (() => Promise.reject(new Error("network down"))) as typeof fetch;

  const result = await fetchRecipeSuggestions(["牛乳"], { ...credentials, fetchImpl });

  assert.deepStrictEqual(result, { kind: "error" });
});
