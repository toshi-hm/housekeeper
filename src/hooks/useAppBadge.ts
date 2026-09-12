import { useEffect } from "react";

import { useItems } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import { useUserSettings } from "@/hooks/useUserSettings";
import { updateAppBadge } from "@/lib/pwa";
import { dropExpiryForDailyGoods, getExpiryStatus } from "@/types/item";

/**
 * PWA アプリバッジの件数を、ダッシュボードの検索語・カテゴリ・保管場所フィルターから
 * 独立した「全件」データセットから算出して同期する。
 *
 * ダッシュボード（`_auth.index.tsx`）にのみマウントされていると、他画面にいる間や
 * フィルター適用中はバッジが更新されないため、常時マウントされるレイアウト
 * （`_auth.tsx`）側で呼び出す。
 */
export const useAppBadge = (): void => {
  const { data: rawItems = [] } = useItems({});
  const { data: categories = [] } = useCategories();
  const { data: userSettings } = useUserSettings();
  const warningDays = userSettings?.expiry_warning_days;

  // #937: カテゴリを後から日用品へ切り替えたアイテムは、食料品時代の
  // expiry_date が残っていてもダッシュボード等の他の期限表示経路と同じく
  // 「期限なし」として扱う（さもないとバッジ件数だけが不一致になる）。
  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const items = dropExpiryForDailyGoods(rawItems, categoryById);

  const urgentCount = items.filter((item) => {
    if (item.units <= 0) return false;
    const status = getExpiryStatus(item.expiry_date, warningDays);
    return status === "expired" || status === "expiring-soon";
  }).length;

  useEffect(() => {
    void updateAppBadge(urgentCount);
  }, [urgentCount]);
};
