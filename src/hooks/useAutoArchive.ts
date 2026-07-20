import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";

const ITEMS_KEY = ["items"] as const;
const DELETED_ITEMS_KEY = ["items", "deleted"] as const;

export interface AutoArchiveBatch {
  ids: string[];
  archivedAt: string;
}

export const autoArchiveExpiredItems = async (): Promise<AutoArchiveBatch | null> => {
  requireOnline();
  const { data, error } = await supabase.rpc("auto_archive_expired_items");
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return { ids: data.map((row) => row.id), archivedAt: data[0]!.archived_at };
};

export const undoAutoArchive = async (batch: AutoArchiveBatch): Promise<number> => {
  requireOnline();
  const { data, error } = await supabase.rpc("undo_auto_archive", {
    p_item_ids: batch.ids,
    p_archived_at: batch.archivedAt,
  });
  if (error) throw error;
  return data ?? 0;
};

/**
 * ダッシュボード初期表示時に、`user_settings.auto_archive_after_days` で設定された日数を
 * 超えて期限切れのままのアイテムをクライアントサイドで自動ソフトデリートする (#419)。
 *
 * サーバー常駐のcronを持たない構成（クライアントのみのアプリ）のため、実行トリガーは
 * 「ダッシュボードを開いたとき」というクライアント操作に紐付ける（Option B）。
 *
 * - `autoArchiveAfterDays` が未設定（null/undefined）なら何もしない
 * - オフライン時はオンライン復帰イベントまで待機する
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
    const run = async () => {
      if (hasRunRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      hasRunRef.current = true;
      try {
        const batch = await autoArchiveExpiredItems();
        if (!batch) return;
        await Promise.all([
          qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" }),
          qc.invalidateQueries({ queryKey: DELETED_ITEMS_KEY, refetchType: "all" }),
        ]);

        toast(t("autoArchiveSuccess", { count: batch.ids.length }), "default", {
          action: {
            label: t("autoArchiveUndo"),
            onClick: () => {
              void (async () => {
                try {
                  await undoAutoArchive(batch);
                  await Promise.all([
                    qc.invalidateQueries({ queryKey: ITEMS_KEY, refetchType: "all" }),
                    qc.invalidateQueries({ queryKey: DELETED_ITEMS_KEY, refetchType: "all" }),
                  ]);
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
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const handleOnline = () => void run();
      window.addEventListener("online", handleOnline, { once: true });
      return () => window.removeEventListener("online", handleOnline);
    }

    void run();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoArchiveAfterDays]);
};
