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

/** online/offline の連打をまとめるためのデバウンス時間。 */
const RECONCILE_DEBOUNCE_MS = 300;
/** CHANNEL_ERROR / TIMED_OUT からの再購読リトライの基準遅延・上限。 */
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30_000;
/** removeChannel が 'ok' 以外を返した場合の再試行までの待機時間。 */
const REMOVE_RETRY_DELAY_MS = 500;

const FAILURE_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

/**
 * Supabase Realtime (`postgres_changes`) を購読し、`items` / `item_lots` /
 * `shopping_list_items` の変更を検知して TanStack Query キャッシュを無効化する。
 *
 * 複数デバイス間で在庫情報をリアルタイム同期するためのフック。
 * オフライン時は購読を張らず、オンライン復帰時に再接続する。
 *
 * #475 対応:
 * - offline/online が短時間に連打されても、最終状態だけを反映するようデバウンスし、
 *   かつ unsubscribe の完了を待ってから subscribe することで channel の二重購読を防ぐ
 *   （操作は operationChain で直列化する）。
 * - subscribe にステータスコールバックを渡し、CHANNEL_ERROR / TIMED_OUT / CLOSED を
 *   検知したら該当 channel を破棄し、指数バックオフで再購読をリトライする。
 */
export const useRealtimeItems = () => {
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    // unsubscribe → subscribe の一連の処理が重ならないよう直列化するキュー
    let operationChain: Promise<void> = Promise.resolve();

    const enqueue = (task: () => Promise<void>) => {
      operationChain = operationChain.then(task).catch(() => undefined);
      return operationChain;
    };

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    /** removeChannel の完了を待つ。'ok' 以外が返った場合は一度だけ再試行する。 */
    const unsubscribe = async () => {
      clearRetryTimer();
      if (!channel) return;
      const target = channel;
      channel = null;
      const result = await supabase.removeChannel(target);
      if (result !== "ok" && !cancelled) {
        await new Promise<void>((resolve) => setTimeout(resolve, REMOVE_RETRY_DELAY_MS));
        if (!cancelled) await supabase.removeChannel(target);
      }
    };

    const scheduleRetry = () => {
      if (cancelled || retryTimer) return;
      retryCount += 1;
      const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** (retryCount - 1), RETRY_MAX_DELAY_MS);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!cancelled && navigator.onLine) {
          void enqueue(async () => {
            subscribe();
          });
        }
      }, delay);
    };

    const subscribe = () => {
      if (cancelled || channel || !navigator.onLine) return;
      const ch = supabase.channel(CHANNEL_NAME);
      for (const { table, queryKey } of REALTIME_TABLES) {
        ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
          void qc.invalidateQueries({ queryKey });
        });
      }
      channel = ch;
      ch.subscribe((status: string) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          retryCount = 0;
          clearRetryTimer();
          return;
        }
        if (FAILURE_STATUSES.has(status)) {
          // このchannelが失敗した場合のみ破棄する（既に新しいchannelに差し替わっていたら何もしない）
          void enqueue(async () => {
            if (channel === ch) await unsubscribe();
            scheduleRetry();
          });
        }
      });
    };

    /** online/offline イベントをデバウンスし、最終的なネットワーク状態だけを反映する。 */
    const reconcile = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void enqueue(async () => {
          await unsubscribe();
          if (cancelled) return;
          if (navigator.onLine) {
            retryCount = 0;
            clearRetryTimer();
            subscribe();
            // 再接続時はオフライン中に発生した変更を取り込むため一度だけ再取得する
            for (const { queryKey } of REALTIME_TABLES) {
              void qc.invalidateQueries({ queryKey });
            }
          }
        });
      }, RECONCILE_DEBOUNCE_MS);
    };

    if (navigator.onLine) subscribe();
    window.addEventListener("online", reconcile);
    window.addEventListener("offline", reconcile);

    return () => {
      cancelled = true;
      window.removeEventListener("online", reconcile);
      window.removeEventListener("offline", reconcile);
      if (debounceTimer) clearTimeout(debounceTimer);
      clearRetryTimer();
      void unsubscribe();
    };
  }, [qc]);
};
