import { ChefHat, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { RecipeSuggestion } from "@/hooks/useRecipeSuggestions";

interface ExpiryRecipeSuggestionsProps {
  isLoading: boolean;
  suggestions: RecipeSuggestion[];
}

/** Suggests external recipes for using up expiring-soon/expired items,
 *  shown near the dashboard's ExpiryBanner (#461). Purely presentational —
 *  the parent page owns the `useRecipeSuggestions` query and decides which
 *  item names to search for. Renders nothing while loading or when there
 *  are no suggestions (e.g. `RECIPE_API_KEY` isn't configured, or the
 *  external API returned nothing) so the feature degrades invisibly rather
 *  than showing an empty/broken-looking panel. */
export const ExpiryRecipeSuggestions = ({
  isLoading,
  suggestions,
}: ExpiryRecipeSuggestionsProps) => {
  const { t } = useTranslation("items");

  if (isLoading) {
    return (
      <div
        className="animate-pulse rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
        aria-hidden="true"
      >
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 shrink-0" />
          <span>{t("recipeSuggestionsLoading")}</span>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
      <div className="flex items-center gap-2">
        <ChefHat className="h-5 w-5 shrink-0" />
        <p className="text-sm font-medium">{t("recipeSuggestionsTitle")}</p>
      </div>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {suggestions.map((recipe) => (
          <li key={recipe.id} className="w-36 shrink-0">
            <a
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border border-emerald-200 bg-white p-2 text-xs hover:bg-emerald-100/60 dark:border-emerald-800 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/40"
            >
              {recipe.imageUrl ? (
                <img
                  src={recipe.imageUrl}
                  alt=""
                  className="mb-1.5 aspect-square w-full rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="mb-1.5 flex aspect-square w-full items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/40">
                  <ChefHat className="h-6 w-6 text-emerald-400" />
                </div>
              )}
              <span className="line-clamp-2 font-medium text-emerald-900 dark:text-emerald-100">
                {recipe.title}
              </span>
              <span className="mt-1 flex items-center gap-0.5 text-emerald-600 dark:text-emerald-300">
                <ExternalLink className="h-3 w-3 shrink-0" />
                {t("recipeSuggestionsExternalLink")}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
