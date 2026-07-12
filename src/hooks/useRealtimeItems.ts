import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/lib/supabase";

/** Realtime で購読するテーブルと、変更時に無効化する TanStack Query のキー。 */
const REALTIME_TABLES = [
  { table: "items", queryKey: ["items"] },
  { table: "item_lots", queryKey: ["item-lots"] },
  { table: "shopping_list_items", queryKey: ["shopping"] },
] as const;

const CHANNEL_NAME = "housekeeper-realtime";

/**
 * Supabase Realtime (`postgres_changes`) を購読し、`items` / `item_lots` /
 * `shopping_list_items` の変更を検知して TanStack Query キャッシュを無効化する。
 *
 * 複数デバイス間で在庫情報をリアルタイム同期するためのフック。
 * オフライン時は購読を張らず、オンライン復帰時に再接続する。
 */
export const useRealtimeItems = () => {
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = () => {
      if (channel) return;
      const ch = supabase.channel(CHANNEL_NAME);
      for (const { table, queryKey } of REALTIME_TABLES) {
        ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
          void qc.invalidateQueries({ queryKey });
        });
      }
      ch.subscribe();
      channel = ch;
    };

    const unsubscribe = () => {
      if (!channel) return;
      void supabase.removeChannel(channel);
      channel = null;
    };

    const handleOnline = () => {
      subscribe();
      // 再接続時はオフライン中に発生した変更を取り込むため一度だけ再取得する
      for (const { queryKey } of REALTIME_TABLES) {
        void qc.invalidateQueries({ queryKey });
      }
    };

    if (navigator.onLine) subscribe();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", unsubscribe);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", unsubscribe);
      unsubscribe();
    };
  }, [qc]);
};
