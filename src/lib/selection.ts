/** Set 内の ID をトグルし、新しい Set を返す（不変更新）。 */
export const toggleId = (set: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** `visibleIds` に含まれる選択だけを残した新しい Set を返す（非表示になった選択を除外）。 */
export const pruneSelection = (
  set: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> => {
  const visible = new Set(visibleIds);
  return new Set([...set].filter((id) => visible.has(id)));
};

/** 全 ID を選択した Set を返す。すでに全選択済みなら空 Set（全解除）を返す。 */
export const toggleSelectAll = (
  set: ReadonlySet<string>,
  allIds: readonly string[],
): Set<string> => {
  const allSelected = allIds.length > 0 && allIds.every((id) => set.has(id));
  return allSelected ? new Set() : new Set(allIds);
};
