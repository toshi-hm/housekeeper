import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  dequeueOfflineAction,
  enqueueOfflineAction,
  type OfflineQueuedAction,
  readOfflineActionQueue,
} from "@/lib/offlineActionQueue";
import { ConcurrentUpdateError, OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import type { PurchaseInput, UpsertShoppingItemInput } from "@/types/shopping";

/** `queuePurchase`/`queueAddAlert` の呼び出し結果。`"sent"` はオンラインで実際に
 *  実行できたことを、`"queued"` はオフラインのためキューに積んだだけであることを表す。 */
type OfflineQueueSendResult<TResult> = { status: "sent"; result: TResult } | { status: "queued" };

export interface UseOfflineActionQueueOptions<TPurchaseResult, TAddAlertResult> {
  /** オンライン時に実際に呼び出す `purchaseShoppingItem` 相当の関数。
   *  `usePurchaseShoppingItem().mutateAsync` を渡す想定（この関数自体の
   *  onSuccess/onError — クエリ無効化・エラートースト — がそのまま活きる）。 */
  purchase: (input: PurchaseInput) => Promise<TPurchaseResult>;
  /** オンライン時に実際に呼び出す `upsertShoppingItem` 相当の関数。
   *  `useUpsertShoppingItem().mutateAsync` を渡す想定。 */
  addAlert: (input: UpsertShoppingItemInput) => Promise<TAddAlertResult>;
}

export interface UseOfflineActionQueueResult<TPurchaseResult, TAddAlertResult> {
  /** 現在キューに積まれているオフラインアクション数。 */
  queueLength: number;
  /** `purchaseShoppingItem` 呼び出しをオフライン対応でラップする。オンラインなら
   *  そのまま実行し、オフライン（またはリクエスト直前にオフラインへ変わった場合）は
   *  キューへ積んで `{ status: "queued" }` を返す。 */
  queuePurchase: (input: PurchaseInput) => Promise<OfflineQueueSendResult<TPurchaseResult>>;
  /** `upsertShoppingItem`（アラートから買い物リストへ追加）呼び出しをオフライン対応で
   *  ラップする。挙動は `queuePurchase` と同様。 */
  queueAddAlert: (
    input: UpsertShoppingItemInput,
  ) => Promise<OfflineQueueSendResult<TAddAlertResult>>;
}

/**
 * #981: 買い物中モードの「購入確定」「アラートから買い物リストへ追加」の2アクションに
 * 限定したオフライン耐性強化。`docs/specs/features/pwa.md` の既存方針（編集系はオフライン時
 * エラー表示で抑止し、キューイングしない）に対する、この2アクションだけの明示的な例外
 * （`docs/specs/features/shopping-mode.md` 拡張1）。
 *
 * `useShoppingList.ts` 自体のオンライン専用契約（`requireOnline()` で即座に `OfflineError`）は
 * 変更しない。このフックは呼び出し元（`_auth.shopping.tsx` の `ShoppingModeView` 呼び出し箇所）
 * だけがオプトインして使う薄いラッパーで、オフライン時は `localStorage` ベースのキュー
 * （`src/lib/offlineActionQueue.ts`）に積み、`window` の `online` イベント（再接続検知）で
 * 自動的にリプレイする。
 *
 * リプレイは積まれた順に1件ずつ実行する:
 * - 成功: キューから取り除く
 * - `ConcurrentUpdateError`（#952の楽観的排他制御パターン）: このアクションだけ諦めて
 *   キューから取り除き、次のアクションのリプレイを継続する（自動マージはしない。ユーザーへの
 *   通知は渡された `purchase`/`addAlert` 自体の `onError` に委ねる）
 * - `OfflineError`（リプレイ中に再びオフラインへ変わった）: このアクション・残りは
 *   キューに残したままリプレイを打ち切り、次の `online` イベントを待つ
 * - その他の想定外のエラー: ユーザーの操作を失わないよう、このアクション・残りをキューに
 *   残したままリプレイを打ち切る
 */
export const useOfflineActionQueue = <TPurchaseResult, TAddAlertResult>(
  options: UseOfflineActionQueueOptions<TPurchaseResult, TAddAlertResult>,
): UseOfflineActionQueueResult<TPurchaseResult, TAddAlertResult> => {
  const { toast } = useToast();
  const { t } = useTranslation("shopping");
  const [queue, setQueue] = useState<OfflineQueuedAction[]>(() => readOfflineActionQueue());
  const queueRef = useRef(queue);
  const optionsRef = useRef(options);
  // Refsはrender中に書き換えない — 毎render後に走るeffectで同期する
  // （useUndoableActionのoptionsRefと同じパターン）。
  useEffect(() => {
    queueRef.current = queue;
    optionsRef.current = options;
  });
  const replayingRef = useRef(false);

  const enqueue = useCallback(
    (
      action:
        | { kind: "purchase"; payload: PurchaseInput }
        | { kind: "add-alert"; payload: UpsertShoppingItemInput },
    ) => {
      setQueue((prev) => enqueueOfflineAction(prev, action));
    },
    [],
  );

  const dequeue = useCallback((id: string) => {
    setQueue((prev) => dequeueOfflineAction(prev, id));
  }, []);

  const replay = useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;
    try {
      // リプレイ中に新規enqueueされた分は対象に含めない（次回のreplayに回す）。
      const snapshot = queueRef.current;
      let succeeded = 0;
      for (const action of snapshot) {
        try {
          if (action.kind === "purchase") {
            await optionsRef.current.purchase(action.payload);
          } else {
            await optionsRef.current.addAlert(action.payload);
          }
          dequeue(action.id);
          succeeded += 1;
        } catch (err) {
          if (err instanceof ConcurrentUpdateError) {
            // #952: 競合はこのアクションだけ諦める。通知は渡された関数自身の
            // onError に委ね、自動マージはしない。残りのリプレイは継続する。
            dequeue(action.id);
            continue;
          }
          // OfflineError（再びオフラインに戻った）、またはその他の想定外のエラー。
          // どちらもユーザーの操作を失わないようキューに残し、リプレイを打ち切る。
          break;
        }
      }
      if (succeeded > 0) {
        toast(t("offlineQueueReplaySuccess", { count: succeeded }), "success");
      }
    } finally {
      replayingRef.current = false;
    }
  }, [dequeue, t, toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // マウント時点で既にオンラインかつキューが残っている（前回セッションでオフライン
    // のまま積まれた等）場合は、再接続イベントを待たずに即座にリプレイを試みる。
    if (navigator.onLine && queueRef.current.length > 0) {
      void replay();
    }
    const handleOnline = () => void replay();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // replay自体は常にqueueRef/optionsRefの最新値を参照するため、マウント時に
    // 一度だけ判定・購読すればよい。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queuePurchase = useCallback(
    async (input: PurchaseInput): Promise<OfflineQueueSendResult<TPurchaseResult>> => {
      if (!navigator.onLine) {
        enqueue({ kind: "purchase", payload: input });
        return { status: "queued" };
      }
      try {
        const result = await optionsRef.current.purchase(input);
        return { status: "sent", result };
      } catch (err) {
        if (err instanceof OfflineError) {
          enqueue({ kind: "purchase", payload: input });
          return { status: "queued" };
        }
        throw err;
      }
    },
    [enqueue],
  );

  const queueAddAlert = useCallback(
    async (input: UpsertShoppingItemInput): Promise<OfflineQueueSendResult<TAddAlertResult>> => {
      if (!navigator.onLine) {
        enqueue({ kind: "add-alert", payload: input });
        return { status: "queued" };
      }
      try {
        const result = await optionsRef.current.addAlert(input);
        return { status: "sent", result };
      } catch (err) {
        if (err instanceof OfflineError) {
          enqueue({ kind: "add-alert", payload: input });
          return { status: "queued" };
        }
        throw err;
      }
    },
    [enqueue],
  );

  return { queueLength: queue.length, queuePurchase, queueAddAlert };
};
