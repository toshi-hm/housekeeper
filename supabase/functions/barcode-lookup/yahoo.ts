// Yahoo!ショッピング商品検索の呼び出しロジック。gemini.ts (inventory-chat) /
// recipe.ts (recipe-suggest) と同じく、Deno.env や素の fetch に直接依存させず
// fetchImpl を注入できる形にして単体テスト可能にしている（#709: このファイルが
// 分離される前は index.ts にベタ書きされておりタイムアウトもなかった）。

export interface YahooProduct {
  name: string;
  description: string | null;
  image_url: string | null;
  brand: string | null;
}

interface YahooShoppingHit {
  name?: string;
  description?: string;
  image?: { medium?: string };
  brand?: { name?: string };
}

interface YahooShoppingResponse {
  totalResultsReturned?: number;
  hits?: YahooShoppingHit[];
}

export type YahooLookupResult =
  | { kind: "ok"; product: YahooProduct | null }
  | { kind: "timeout" }
  | { kind: "error" };

const YAHOO_SHOPPING_API_TIMEOUT_MS = 8000;

export interface FetchYahooShoppingProductOptions {
  appId: string;
  barcode: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to `YAHOO_SHOPPING_API_TIMEOUT_MS` (8s). */
  timeoutMs?: number;
}

/** Looks up a product by barcode via the Yahoo!ショッピング item search API.
 *  Never throws — a non-OK response, a network error, and a timeout all
 *  resolve to a distinct soft result so the caller can map each to its own
 *  HTTP status/error code instead of hanging or surfacing one generic
 *  failure for every cause. */
export const fetchYahooShoppingProduct = async ({
  appId,
  barcode,
  fetchImpl = fetch,
  timeoutMs = YAHOO_SHOPPING_API_TIMEOUT_MS,
}: FetchYahooShoppingProductOptions): Promise<YahooLookupResult> => {
  const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
  url.searchParams.set("appid", appId);
  url.searchParams.set("jan_code", barcode);
  url.searchParams.set("results", "1");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url.toString(), { signal: controller.signal });

    if (!res.ok) {
      // #655: an upstream Yahoo Shopping API failure is a server-side
      // problem, not "no such product" — surface it as an error instead of
      // a silent 200 with product: null, which the client used to
      // indistinguishably render as "商品が見つかりません".
      console.error("[barcode-lookup] Yahoo Shopping API error:", res.status, await res.text());
      return { kind: "error" };
    }

    const json = (await res.json()) as YahooShoppingResponse;

    if (!json.hits || json.hits.length === 0) {
      return { kind: "ok", product: null };
    }

    const hit = json.hits[0];

    return {
      kind: "ok",
      product: {
        name: hit.name ?? "",
        description: hit.description ?? null,
        image_url: hit.image?.medium ?? null,
        brand: hit.brand?.name ?? null,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // #709: the external API used to be able to hang forever with no
      // timeout, spinning the client's lookup indicator indefinitely.
      console.error("[barcode-lookup] Yahoo Shopping API timeout after", timeoutMs, "ms");
      return { kind: "timeout" };
    }
    console.error("[barcode-lookup] Yahoo Shopping API fetch error:", err);
    return { kind: "error" };
  } finally {
    clearTimeout(timeoutId);
  }
};
