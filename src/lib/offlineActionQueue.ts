import type { PurchaseInput, UpsertShoppingItemInput } from "@/types/shopping";

/** localStorageに保持するキューのキー。 */
const STORAGE_KEY = "shopping.offlineActionQueue";

interface OfflineQueuedPurchaseAction {
  id: string;
  kind: "purchase";
  payload: PurchaseInput;
  queuedAt: string;
}

interface OfflineQueuedAddAlertAction {
  id: string;
  kind: "add-alert";
  payload: UpsertShoppingItemInput;
  queuedAt: string;
}

export type OfflineQueuedAction = OfflineQueuedPurchaseAction | OfflineQueuedAddAlertAction;

/** `enqueueOfflineAction` に渡す、id/queuedAt採番前の入力。 */
export type OfflineActionInput =
  | { kind: "purchase"; payload: PurchaseInput }
  | { kind: "add-alert"; payload: UpsertShoppingItemInput };

const isOfflineQueuedAction = (value: unknown): value is OfflineQueuedAction => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.kind === "purchase" || v.kind === "add-alert") &&
    typeof v.queuedAt === "string" &&
    typeof v.payload === "object" &&
    v.payload !== null
  );
};

/**
 * #981: 買い物中モードの「購入確定」「アラートから買い物リストへ追加」の2アクションに
 * 限定したオフラインキューの永続化層。`useCartCheckOff.ts`（#983）と同様、読み込み側は
 * 壊れた/想定外の値に対して静かに安全なデフォルト（空配列）へフォールバックする。
 * React hookから独立した純粋関数として切り出し、単体テストしやすくしている。
 */
export const readOfflineActionQueue = (): OfflineQueuedAction[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOfflineQueuedAction);
  } catch {
    return [];
  }
};

const writeOfflineActionQueue = (queue: readonly OfflineQueuedAction[]): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // 非致命: private browsing のストレージ制限・容量超過等でも、呼び出し元の
    // React state 側は更新済みのまま処理を継続させる（読み込み側と同様の方針）。
  }
};

/** 新しいアクションをキュー末尾に積み、永続化した上で新しい配列を返す。 */
export const enqueueOfflineAction = (
  queue: readonly OfflineQueuedAction[],
  action: OfflineActionInput,
): OfflineQueuedAction[] => {
  const entry: OfflineQueuedAction = {
    ...action,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };
  const next = [...queue, entry];
  writeOfflineActionQueue(next);
  return next;
};

/** 指定idのアクションをキューから取り除き、永続化した上で新しい配列を返す。 */
export const dequeueOfflineAction = (
  queue: readonly OfflineQueuedAction[],
  id: string,
): OfflineQueuedAction[] => {
  const next = queue.filter((a) => a.id !== id);
  writeOfflineActionQueue(next);
  return next;
};
