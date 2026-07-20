import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { bulkRestoreItems, bulkSoftDeleteItems, fetchItemsWithExpiry } from "@/hooks/useItems";
import { useToast } from "@/lib/toast-context";
import { shouldAutoArchive } from "@/types/item";

const ITEMS_KEY = ["items"] as const;

/**
 * ダッシュボード初期表示時に、`user_settings.auto_archive_after_days` で設定された日数を
 * 超えて期限切れのままのアイテムをクライアントサイドで自動ソフトデリートする (#419)。
 *
 * サーバー常駐のcronを持たない構成（クライアントのみのアプリ）のため、実行トリガーは
 * 「ダッシュボードを開いたとき」というクライアント操作に紐付ける（Option B）。
 *
 * - `autoArchiveAfterDays` が未設定（null/undefined）なら何もしない
 * - オフライン時はスキップする（`navigator.onLine` を見て早期リターン）
 * - 1回のマウントにつき1回だけ実行する（`hasRunRef` で二重実行を防止）
 * - 実行後は「N件のアイテムをアーカイブしました」トースト + 「元に戻す」アクションを表示する
 *   （トーストは5秒で自動的に消える＝実質的な取り消し猶予）
 */
export const useAutoArchiveExpiredItems = (autoArchiveAfterDays: number | null | undefined) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation(["items", "common"]);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    if (!autoArchiveAfterDays || autoArchiveAfterDays < 1) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    hasRunRef.current = true;

    void (async () => {
      try {
        const items = await fetchItemsWithExpiry();
        const targetIds = items
          .filter((item) => shouldAutoArchive(item, autoArchiveAfterDays))
          .map((item) => item.id);

        if (targetIds.length === 0) return;

        await bulkSoftDeleteItems(targetIds);
        await qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" });

        toast(t("autoArchiveSuccess", { count: targetIds.length }), "default", {
          action: {
            label: t("autoArchiveUndo"),
            onClick: () => {
              void (async () => {
                try {
                  await bulkRestoreItems(targetIds);
                  await qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" });
                } catch {
                  toast(t("common:unknownError"), "error");
                }
              })();
            },
          },
        });
      } catch {
        // 自動アーカイブはあくまで補助機能。バックグラウンド実行のエラーをここで
        // 表面化させるとフレーキーな回線でノイズになるため、静かに諦める。
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoArchiveAfterDays]);
};
