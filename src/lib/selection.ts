/** Set 内の ID をトグルし、新しい Set を返す（不変更新）。 */
export const toggleId = (set: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** 全 ID を選択した Set を返す。すでに全選択済みなら空 Set（全解除）を返す。 */
export const toggleSelectAll = (
  set: ReadonlySet<string>,
  allIds: readonly string[],
): Set<string> => {
  return set.size === allIds.length ? new Set() : new Set(allIds);
};
