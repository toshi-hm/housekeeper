// #622: Supabase/PostgREST caps a single response at `db-max-rows` (default
// 1000, see supabase/config.toml's `api.max_rows`). Any hook that reads a
// table in full for aggregation (consumption logs, items, lot values) must
// page through results instead of relying on a single unbounded select,
// or it silently truncates once a user's data exceeds that row count.
export const SUPABASE_MAX_ROWS = 1000;

/**
 * Repeatedly calls `fetchPage(from, to)` with `.range()`-style offsets until a
 * page comes back shorter than `pageSize`, accumulating every row. The
 * underlying query must apply a stable, deterministic order (including a
 * tiebreaker on ties) or rows can be skipped/duplicated across pages.
 */
export const fetchAllPages = async <T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = SUPABASE_MAX_ROWS,
): Promise<T[]> => {
  const results: T[] = [];
  let from = 0;
  for (;;) {
    const page = await fetchPage(from, from + pageSize - 1);
    results.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return results;
};
