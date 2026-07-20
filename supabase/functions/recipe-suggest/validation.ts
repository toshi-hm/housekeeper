// Item names come from expiring-soon/expired inventory items and are used as
// the external recipe search keyword. Keep the list short and sane so we
// never build an unbounded query string or leak arbitrary client input
// straight into the external API call.
const MAX_ITEM_NAMES = 5;
const MAX_ITEM_NAME_LENGTH = 100;

/** Trims, drops empty/overlong/non-string entries, dedupes, and caps the
 *  list length. Returns `[]` for anything that isn't an array — callers
 *  treat an empty result as "nothing to search for" rather than an error. */
export const sanitizeItemNames = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_ITEM_NAME_LENGTH) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_ITEM_NAMES) break;
  }
  return result;
};
