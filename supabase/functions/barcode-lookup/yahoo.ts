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
  janCode?: string;
  description?: string;
  image?: { medium?: string };
  brand?: { name?: string };
}

interface YahooShoppingResponse {
  totalResultsAvailable?: number;
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

/** UPC-A (12 桁) は先頭 0 を補って JAN-13 に、先頭 0 付きの 14 桁 (GTIN-14) は
 *  先頭 0 を落として JAN-13 に揃える。Yahoo 側の JAN は 13 桁で登録されている。 */
export const normalizeJanCode = (barcode: string): string => {
  if (barcode.length === 12) return `0${barcode}`;
  if (barcode.length === 14 && barcode.startsWith("0")) return barcode.slice(1);
  return barcode;
};

type SearchOutcome =
  | { kind: "ok"; hits: YahooShoppingHit[]; totalAvailable: number | null }
  | { kind: "timeout" }
  | { kind: "error" };

/** Looks up a product by barcode via the Yahoo!ショッピング item search API.
 *  Never throws — a non-OK response, a network error, and a timeout all
 *  resolve to a distinct soft result so the caller can map each to its own
 *  HTTP status/error code instead of hanging or surfacing one generic
 *  failure for every cause.
 *
 *  `jan_code` 検索が 0 件のときは `query` 検索へフォールバックし、janCode が
 *  一致するヒットだけを採用する（jan_code 検索単独だと取りこぼして全件
 *  「商品が見つかりません」になっていたため）。 */
export const fetchYahooShoppingProduct = async ({
  appId,
  barcode,
  fetchImpl = fetch,
  timeoutMs = YAHOO_SHOPPING_API_TIMEOUT_MS,
}: FetchYahooShoppingProductOptions): Promise<YahooLookupResult> => {
  const jan = normalizeJanCode(barcode);

  const search = async (param: "jan_code" | "query"): Promise<SearchOutcome> => {
    const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
    url.searchParams.set("appid", appId);
    url.searchParams.set(param, jan);
    url.searchParams.set("results", param === "jan_code" ? "1" : "10");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(url.toString(), { signal: controller.signal });

      if (!res.ok) {
        // #655: an upstream Yahoo Shopping API failure is a server-side
        // problem, not "no such product" — surface it as an error instead of
        // a silent 200 with product: null.
        console.error("[barcode-lookup] Yahoo Shopping API error:", res.status, await res.text());
        return { kind: "error" };
      }

      const json = (await res.json()) as YahooShoppingResponse;
      return {
        kind: "ok",
        hits: json.hits ?? [],
        totalAvailable: json.totalResultsAvailable ?? null,
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

  const toProduct = (hit: YahooShoppingHit): YahooProduct => ({
    name: hit.name ?? "",
    description: hit.description ?? null,
    image_url: hit.image?.medium ?? null,
    brand: hit.brand?.name ?? null,
  });

  const byJan = await search("jan_code");
  if (byJan.kind !== "ok") return byJan;
  if (byJan.hits.length > 0) return { kind: "ok", product: toProduct(byJan.hits[0]) };

  console.warn(
    "[barcode-lookup] jan_code search returned no hits; falling back to keyword search",
    { jan, totalAvailable: byJan.totalAvailable },
  );
  const byQuery = await search("query");
  if (byQuery.kind !== "ok") return byQuery;
  const matched = byQuery.hits.find((hit) => hit.janCode === jan);
  if (!matched) {
    console.warn("[barcode-lookup] no product found for barcode", {
      jan,
      queryHits: byQuery.hits.length,
    });
    return { kind: "ok", product: null };
  }
  return { kind: "ok", product: toProduct(matched) };
};
