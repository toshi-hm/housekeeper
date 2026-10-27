import { useMemo } from "react";

import { useItems } from "@/hooks/useItems";

/**
 * 名前入力のオートコンプリート候補。登録済みの在庫アイテム名（重複除去）を返す。
 * ダッシュボードと同じ useItems のキャッシュを共有するため追加の通信は発生しない。
 */
export const useNameSuggestions = (options?: { enabled?: boolean }): string[] => {
  const { data: items } = useItems({}, "created_at", { enabled: options?.enabled });
  return useMemo(() => {
    const names = new Set<string>();
    for (const item of items ?? []) {
      const name = item.name.trim();
      if (name) names.add(name);
    }
    return [...names];
  }, [items]);
};
