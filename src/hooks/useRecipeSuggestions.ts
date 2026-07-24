import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface RecipeSuggestion {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
}

interface RecipeSuggestResponse {
  recipes: RecipeSuggestion[];
  reason?: string;
}

// External recipe results don't need to be fresh — the same expiring items
// yield the same suggestions all day, and the external API budget is best
// kept small. Cache long (#461).
const STALE_TIME_MS = 6 * 60 * 60_000;
const GC_TIME_MS = 24 * 60 * 60_000;

const fetchRecipeSuggestions = async (itemNames: string[]): Promise<RecipeSuggestion[]> => {
  if (itemNames.length === 0) return [];

  const { data, error } = await supabase.functions.invoke<RecipeSuggestResponse>("recipe-suggest", {
    body: { itemNames },
  });
  // This is a best-effort, optional suggestion — degrade to "no suggestions"
  // rather than surfacing an error toast for a non-critical feature. This
  // also covers the case where RECIPE_API_KEY isn't configured yet
  // (data?.reason === "missing_api_key"), which resolves to an empty list.
  if (error) {
    console.error("[useRecipeSuggestions] recipe-suggest failed:", error);
    return [];
  }
  return data?.recipes ?? [];
};

/** Suggests recipes for the given (already deduped/capped) expiring item
 *  names. Returns `[]` while disabled/loading/on any failure so callers can
 *  render nothing rather than special-casing errors. */
export const useRecipeSuggestions = (itemNames: string[]) => {
  const key = [...new Set(itemNames)].sort();
  return useQuery({
    queryKey: ["recipe-suggestions", key],
    queryFn: () => fetchRecipeSuggestions(key),
    enabled: key.length > 0,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: 1,
  });
};
