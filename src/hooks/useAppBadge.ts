import { useEffect } from "react";

import { useItems } from "@/hooks/useItems";
import { useUserSettings } from "@/hooks/useUserSettings";
import { updateAppBadge } from "@/lib/pwa";
import { getExpiryStatus } from "@/types/item";

/**
 * PWA アプリバッジの件数を、ダッシュボードの検索語・カテゴリ・保管場所フィルターから
 * 独立した「全件」データセットから算出して同期する。
 *
 * ダッシュボード（`_auth.index.tsx`）にのみマウントされていると、他画面にいる間や
 * フィルター適用中はバッジが更新されないため、常時マウントされるレイアウト
 * （`_auth.tsx`）側で呼び出す。
 */
export const useAppBadge = (): void => {
  const { data: items = [] } = useItems({});
  const { data: userSettings } = useUserSettings();
  const warningDays = userSettings?.expiry_warning_days;

  const urgentCount = items.filter((item) => {
    if (item.units <= 0) return false;
    const status = getExpiryStatus(item.expiry_date, warningDays);
    return status === "expired" || status === "expiring-soon";
  }).length;

  useEffect(() => {
    void updateAppBadge(urgentCount);
  }, [urgentCount]);
};
