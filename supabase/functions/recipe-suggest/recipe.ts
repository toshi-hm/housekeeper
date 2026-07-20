// Core recipe-search logic, kept dependency-free of Deno.env/global fetch so
// it can be unit tested by injecting `apiKey` / `fetchImpl` directly (see
// recipe.test.ts) instead of needing --allow-env/--allow-net in `deno test`.
// `index.ts` reads the real env var and wires it in.

export interface RecipeSuggestion {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
}

export type RecipeSuggestResult =
  | { kind: "ok"; recipes: RecipeSuggestion[] }
  | { kind: "missing_key" }
  | { kind: "error" };

// Shape returned by Rakuten's Recipe API (recipeId/recipeTitle/recipeUrl/
// foodImageUrl are the real field names of that API's response schema).
//
// NOTE: Rakuten only publishes category-based endpoints (CategoryList /
// CategoryRanking) — there is no first-party keyword-search endpoint at the
// time of writing. `RECIPE_API_BASE_URL` lets the concrete provider/endpoint
// be swapped without a code change once a real contract is confirmed; it
// defaults to the CategoryRanking endpoint as a placeholder starting point.
// See docs/specs/features/barcode.md for the shared CORS-avoidance pattern
// this function mirrors, and the PR description for the caveat that this
// needs to be verified against a real API key before going live.
interface RakutenRecipeHit {
  recipeId?: number | string;
  recipeTitle?: string;
  recipeUrl?: string;
  foodImageUrl?: string;
}

interface RakutenRecipeResponse {
  result?: RakutenRecipeHit[];
}

const MAX_SUGGESTIONS = 6;
const RECIPE_API_TIMEOUT_MS = 8000;

export const DEFAULT_RECIPE_API_BASE_URL =
  "https://app.rakuten.co.jp/services/api/Recipe/CategoryRanking/20170426";

export const buildSearchKeyword = (itemNames: string[]): string => itemNames.join(" ");

/** Converts the raw external API JSON into our normalized shape, dropping
 *  hits that are missing a title/url and capping the result count. Never
 *  throws — malformed/unexpected JSON just yields fewer (or zero) results. */
export const shapeRecipeSuggestions = (
  json: unknown,
  limit = MAX_SUGGESTIONS,
): RecipeSuggestion[] => {
  if (!json || typeof json !== "object") return [];
  const hits = (json as RakutenRecipeResponse).result;
  if (!Array.isArray(hits)) return [];

  const suggestions: RecipeSuggestion[] = [];
  for (const hit of hits) {
    if (!hit || typeof hit !== "object") continue;
    const title = typeof hit.recipeTitle === "string" ? hit.recipeTitle.trim() : "";
    const url = typeof hit.recipeUrl === "string" ? hit.recipeUrl.trim() : "";
    if (!title || !url) continue;
    suggestions.push({
      id: hit.recipeId !== undefined && hit.recipeId !== null ? String(hit.recipeId) : url,
      title,
      url,
      imageUrl:
        typeof hit.foodImageUrl === "string" && hit.foodImageUrl.length > 0
          ? hit.foodImageUrl
          : null,
    });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
};

export interface FetchRecipeSuggestionsOptions {
  /** `RECIPE_API_KEY` secret value. `undefined` triggers graceful
   *  degradation (`{ kind: "missing_key" }`) instead of calling the API. */
  apiKey: string | undefined;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests/config; defaults to `DEFAULT_RECIPE_API_BASE_URL`. */
  baseUrl?: string;
}

/** Looks up recipe suggestions for the given item names. Never throws —
 *  every failure mode (missing key, non-OK response, network error) resolves
 *  to a soft result so the caller can degrade gracefully instead of
 *  surfacing a hard error for what is an optional, best-effort suggestion. */
export const fetchRecipeSuggestions = async (
  itemNames: string[],
  {
    apiKey,
    fetchImpl = fetch,
    baseUrl = DEFAULT_RECIPE_API_BASE_URL,
  }: FetchRecipeSuggestionsOptions,
): Promise<RecipeSuggestResult> => {
  if (!apiKey) {
    console.error("[recipe-suggest] RECIPE_API_KEY is not configured");
    return { kind: "missing_key" };
  }
  if (itemNames.length === 0) {
    return { kind: "ok", recipes: [] };
  }

  const url = new URL(baseUrl);
  url.searchParams.set("applicationId", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("keyword", buildSearchKeyword(itemNames));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RECIPE_API_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      console.error("[recipe-suggest] Recipe API error:", res.status);
      return { kind: "error" };
    }
    const json: unknown = await res.json();
    return { kind: "ok", recipes: shapeRecipeSuggestions(json) };
  } catch (err) {
    console.error("[recipe-suggest] Recipe API fetch error:", err);
    return { kind: "error" };
  } finally {
    clearTimeout(timeoutId);
  }
};
