// Rakuten's Recipe APIs only expose category listing and category ranking.
// There is no keyword search endpoint, so we find recipe categories whose
// names match the expiring items, fetch those rankings, then filter the
// returned recipe ingredients locally (see docs/specs/features/expiry-alert.md).

export interface RecipeSuggestion {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
}

export type RecipeSuggestResult =
  | { kind: "ok"; recipes: RecipeSuggestion[] }
  | { kind: "missing_api_key" }
  | { kind: "missing_access_key" }
  | { kind: "error" };

interface RakutenRecipeHit {
  recipeId?: number | string;
  recipeTitle?: string;
  recipeUrl?: string;
  foodImageUrl?: string;
  recipeMaterial?: unknown;
}

interface RakutenRecipeResponse {
  result?: unknown;
}

interface RakutenRecipeCategory {
  categoryId: string;
  categoryName: string;
}

const MAX_SUGGESTIONS = 6;
const MAX_CATEGORY_RANKINGS = 3;
const API_REQUEST_TIMEOUT_MS = 8000;
const ITEM_KEYWORD_SYNONYMS = [
  ["卵", "たまご", "玉子", "鶏卵"],
  ["牛乳", "ミルク"],
];

export const DEFAULT_RECIPE_API_BASE_URL =
  "https://openapi.rakuten.co.jp/recipems/api/Recipe/CategoryRanking/20170426";
export const DEFAULT_RECIPE_CATEGORY_LIST_URL =
  "https://openapi.rakuten.co.jp/recipems/api/Recipe/CategoryList/20170426";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toSearchText = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s\p{P}\p{S}]/gu, "");

/** Remove common amount/unit suffixes and split item labels into useful terms. */
const getItemKeywords = (itemNames: string[]): string[] => {
  const keywords = itemNames.flatMap((itemName) => {
    const withoutAmounts = itemName
      .normalize("NFKC")
      .replace(/\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l|個|本|袋|枚|パック|箱|缶)/giu, " ");
    return withoutAmounts.split(/[\s、,，/／|]+/u).map(toSearchText);
  });

  const expandedKeywords = keywords.flatMap((keyword) => {
    const synonymGroup = ITEM_KEYWORD_SYNONYMS.find((group) =>
      group.some((term) => term === keyword),
    );
    return synonymGroup ? synonymGroup.map(toSearchText) : [keyword];
  });
  return [...new Set(expandedKeywords.filter((keyword) => keyword.length > 0))];
};

const getCategories = (json: unknown): RakutenRecipeCategory[] => {
  if (!isRecord(json) || !isRecord(json.result)) return [];

  const categories = new Map<string, RakutenRecipeCategory>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!isRecord(value)) return;

    const rawId = value.categoryId;
    const rawName = value.categoryName;
    const categoryId = typeof rawId === "number" ? String(rawId) : rawId;
    if (
      typeof categoryId === "string" &&
      /^\d+(?:-\d+){0,2}$/u.test(categoryId) &&
      typeof rawName === "string" &&
      rawName.trim().length > 0
    ) {
      categories.set(categoryId, { categoryId, categoryName: rawName.trim() });
    }

    for (const child of Object.values(value)) visit(child);
  };

  visit(json.result);
  return [...categories.values()];
};

const findRelevantCategories = (
  categories: RakutenRecipeCategory[],
  keywords: string[],
): RakutenRecipeCategory[] =>
  categories
    .map((category) => {
      const searchableName = toSearchText(category.categoryName);
      const matchingKeywords = keywords.filter(
        (keyword) => searchableName.includes(keyword) || keyword.includes(searchableName),
      );
      return { category, matchingKeywords };
    })
    .filter(({ matchingKeywords }) => matchingKeywords.length > 0)
    .sort((left, right) => {
      const matchCount = right.matchingKeywords.length - left.matchingKeywords.length;
      if (matchCount !== 0) return matchCount;
      const termLength =
        Math.max(...right.matchingKeywords.map((keyword) => keyword.length)) -
        Math.max(...left.matchingKeywords.map((keyword) => keyword.length));
      if (termLength !== 0) return termLength;
      return left.category.categoryId.localeCompare(right.category.categoryId);
    })
    .slice(0, MAX_CATEGORY_RANKINGS)
    .map(({ category }) => category);

const extractMaterials = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const materials: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      materials.push(entry);
    } else if (isRecord(entry)) {
      const name = entry.name ?? entry.material;
      if (typeof name === "string") materials.push(name);
    }
  }
  return materials;
};

const hasMatchingIngredient = (hit: RakutenRecipeHit, keywords: string[]): boolean => {
  const materials = extractMaterials(hit.recipeMaterial).map(toSearchText);
  return materials.some((material) => keywords.some((keyword) => material.includes(keyword)));
};

/** Converts the raw API JSON into app results, keeping only recipes that
 *  contain at least one requested item and capping the result count. */
export const shapeRecipeSuggestions = (
  json: unknown,
  keywords: string[],
  limit = MAX_SUGGESTIONS,
): RecipeSuggestion[] => {
  if (!isRecord(json) || !Array.isArray((json as RakutenRecipeResponse).result)) return [];

  const suggestions: RecipeSuggestion[] = [];
  const seen = new Set<string>();
  for (const rawHit of (json as RakutenRecipeResponse).result as unknown[]) {
    if (!isRecord(rawHit)) continue;
    const hit = rawHit as RakutenRecipeHit;
    const title = typeof hit.recipeTitle === "string" ? hit.recipeTitle.trim() : "";
    const url = typeof hit.recipeUrl === "string" ? hit.recipeUrl.trim() : "";
    if (!title || !url || !hasMatchingIngredient(hit, keywords)) continue;

    const id = hit.recipeId !== undefined && hit.recipeId !== null ? String(hit.recipeId) : url;
    if (seen.has(id)) continue;
    seen.add(id);
    suggestions.push({
      id,
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
  /** Existing secret containing Rakuten's `applicationId` (App ID). */
  apiKey: string | undefined;
  /** Required Rakuten `accessKey`; it is sent as a header, not a URL parameter. */
  accessKey: string | undefined;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable endpoint overrides used by deterministic unit tests. */
  rankingUrl?: string;
  categoryListUrl?: string;
}

const fetchJson = async (
  url: URL,
  accessKey: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<unknown> => {
  const response = await fetchImpl(url.toString(), {
    headers: { accessKey },
    signal,
  });
  if (!response.ok) throw new Error(`Rakuten API returned ${response.status}`);
  return await response.json();
};

const createApiUrl = (baseUrl: string, apiKey: string, categoryId?: string): URL => {
  const url = new URL(baseUrl);
  url.searchParams.set("applicationId", apiKey);
  url.searchParams.set("format", "json");
  if (categoryId) url.searchParams.set("categoryId", categoryId);
  return url;
};

/** Looks up Rakuten category rankings and filters their returned ingredients
 *  locally. Failures degrade to an empty result because suggestions are optional. */
export const fetchRecipeSuggestions = async (
  itemNames: string[],
  {
    apiKey,
    accessKey,
    fetchImpl = fetch,
    rankingUrl = DEFAULT_RECIPE_API_BASE_URL,
    categoryListUrl = DEFAULT_RECIPE_CATEGORY_LIST_URL,
  }: FetchRecipeSuggestionsOptions,
): Promise<RecipeSuggestResult> => {
  if (!apiKey) {
    console.error("[recipe-suggest] RECIPE_API_KEY (Rakuten applicationId) is not configured");
    return { kind: "missing_api_key" };
  }
  if (!accessKey) {
    console.error("[recipe-suggest] RECIPE_ACCESS_KEY is not configured");
    return { kind: "missing_access_key" };
  }
  if (itemNames.length === 0) return { kind: "ok", recipes: [] };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  try {
    const keywords = getItemKeywords(itemNames);
    const categoryUrl = createApiUrl(categoryListUrl, apiKey);
    const categoriesResponse = await fetchJson(
      categoryUrl,
      accessKey,
      fetchImpl,
      controller.signal,
    );
    const categories = getCategories(categoriesResponse);
    const relevantCategories = findRelevantCategories(categories, keywords);

    // Rakuten does not offer recipe keyword search. If no category matches,
    // query the overall ranking and return only recipes whose materials match.
    const rankingCategories = relevantCategories.length > 0 ? relevantCategories : [undefined];
    const rankingResponses = await Promise.all(
      rankingCategories.map((category) => {
        const rankingRequestUrl = createApiUrl(rankingUrl, apiKey, category?.categoryId);
        return fetchJson(rankingRequestUrl, accessKey, fetchImpl, controller.signal);
      }),
    );
    const recipes: RecipeSuggestion[] = [];
    const seen = new Set<string>();
    for (const response of rankingResponses) {
      for (const suggestion of shapeRecipeSuggestions(response, keywords)) {
        if (seen.has(suggestion.id)) continue;
        seen.add(suggestion.id);
        recipes.push(suggestion);
        if (recipes.length >= MAX_SUGGESTIONS) return { kind: "ok", recipes };
      }
    }
    return { kind: "ok", recipes };
  } catch (error) {
    console.error("[recipe-suggest] Recipe API request failed:", error);
    return { kind: "error" };
  } finally {
    clearTimeout(timeoutId);
  }
};
