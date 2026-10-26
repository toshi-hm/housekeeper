import { normalizeItemName } from "@/lib/similarItemMatch";

const AUTOCOMPLETE_MAX_RESULTS = 6;

/** かな/カナを区別せず前方一致できるよう、カタカナをひらがなへ寄せる。 */
const toComparable = (value: string): string =>
  normalizeItemName(value).replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );

/**
 * 入力文字列に合う候補を返す。前方一致を先に、次に部分一致を並べる。
 * 入力と完全に一致する候補・重複は除外する（出しても選ぶ意味がないため）。
 */
export const filterSuggestions = (
  candidates: readonly string[],
  query: string,
  limit: number = AUTOCOMPLETE_MAX_RESULTS,
): string[] => {
  const q = toComparable(query);
  if (!q) return [];

  const seen = new Set<string>();
  const prefix: string[] = [];
  const partial: string[] = [];
  for (const candidate of candidates) {
    const c = toComparable(candidate);
    if (!c || c === q || seen.has(c)) continue;
    seen.add(c);
    if (c.startsWith(q)) prefix.push(candidate);
    else if (c.includes(q)) partial.push(candidate);
  }
  return [...prefix, ...partial].slice(0, limit);
};
