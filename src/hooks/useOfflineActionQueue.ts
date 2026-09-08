import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  dequeueOfflineAction,
  enqueueOfflineAction,
  type OfflineQueuedAction,
  readOfflineActionQueue,
} from "@/lib/offlineActionQueue";
import { ConcurrentUpdateError, OfflineError } from "@/lib/requireOnline";
import { isNetworkFetchError, isPermanentReplayError } from "@/lib/supabaseErrors";
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
  /** 現在キューに積まれているアクションそのもの（#1021）。UI側で内容の確認・
   *  個別破棄（`discardQueuedAction`）の導線を出すために公開している。積まれた順。 */
  queuedActions: OfflineQueuedAction[];
  /** 指定したアクションをユーザー操作でキューから取り除く（#1021）。`replay` の
   *  自動判定とは独立した、UIからの明示的な手動破棄用。同期は行わない —
   *  そのアクションの内容は失われる。 */
  discardQueuedAction: (id: string) => void;
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
 * - 恒久的エラー（`isPermanentReplayError`、#1021。PostgreSQLの制約違反等、同じ
 *   ペイロードで再送しても確実に同じ結果になると判断できるエラーのみの狭い許可
 *   リスト方式、判定基準は `src/lib/supabaseErrors.ts` 参照）: このアクションを
 *   キューから取り除いてユーザーへトースト通知し、次のアクションのリプレイを継続する。
 *   1件の恒久的失敗が先頭に残り続けて以降の同期が完全に止まる事態を防ぐ
 * - `OfflineError` / ネットワーク起因のfetch失敗（`isNetworkFetchError`, #1022）
 *   （リプレイ中に再びオフラインへ変わった、または一時的な通信断）: このアクション・
 *   残りはキューに残したままリプレイを打ち切り、次の `online` イベントを待つ
 * - その他の判別できない想定外のエラー: 恒久的と誤判定してユーザーの操作を失わない
 *   よう、保守的にこのアクション・残りをキューに残したままリプレイを打ち切る
 *
 * キューの内容は `queuedActions` で公開しており、`_auth.shopping.tsx` の
 * `OfflineQueuePanel` から確認・`discardQueuedAction` による個別の手動破棄ができる
 * （#1021: 恒久的エラーの自動判定に該当しない、長時間残り続けるアクションの
 * リカバリ手段）。
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
      let discarded = 0;
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
          if (isPermanentReplayError(err)) {
            // #1021: 恒久的エラー（バリデーション等、同じ内容で再送しても確実に
            // 失敗すると判断できるもの）はこのアクションだけ諦めてキューから
            // 取り除く。先頭で永久に詰まって以降の同期が完全停止するのを防ぐため、
            // 残りのリプレイは継続する。
            dequeue(action.id);
            discarded += 1;
            continue;
          }
          // OfflineError、ネットワーク起因のfetch失敗（#1022）、またはその他の
          // 判別できない想定外のエラー。恒久的と誤判定してユーザーの操作を失わない
          // よう、保守的にこのアクション・残りをキューに残したままリプレイを打ち切る。
          break;
        }
      }
      if (succeeded > 0) {
        toast(t("offlineQueueReplaySuccess", { count: succeeded }), "success");
      }
      if (discarded > 0) {
        toast(t("offlineQueueReplayDiscarded", { count: discarded }), "error");
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
        // #1022: navigator.onLine は true のままでも、弱電波・輻輳等で実際の
        // fetch自体が失敗することがある（`isNetworkFetchError`）。この場合も
        // OfflineError と同様にキューへ積み、操作内容を失わないようにする。
        if (err instanceof OfflineError || isNetworkFetchError(err)) {
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
        // #1022: queuePurchase と同様、navigator.onLine が true でも実際の
        // fetch失敗はキュー対象に含める。
        if (err instanceof OfflineError || isNetworkFetchError(err)) {
          enqueue({ kind: "add-alert", payload: input });
          return { status: "queued" };
        }
        throw err;
      }
    },
    [enqueue],
  );

  return {
    queueLength: queue.length,
    queuedActions: queue,
    discardQueuedAction: dequeue,
    queuePurchase,
    queueAddAlert,
  };
};
