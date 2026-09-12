import { useCallback, useState } from "react";

const STORAGE_KEY = "shopping.cartCheckedIds";

interface StoredCheckedMap {
  [id: string]: true;
}

const isStoredCheckedMap = (value: unknown): value is StoredCheckedMap =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => v === true);

const readStoredCheckedIds = (): ReadonlySet<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set();
    const parsed: unknown = JSON.parse(stored);
    return isStoredCheckedMap(parsed) ? new Set(Object.keys(parsed)) : new Set();
  } catch {
    return new Set();
  }
};

const writeStoredCheckedIds = (ids: ReadonlySet<string>) => {
  const map: StoredCheckedMap = Object.fromEntries(Array.from(ids, (id) => [id, true] as const));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 非致命: private browsing のストレージ制限・容量超過等でも、React state
    // 側の checkedIds は更新済みのまま画面表示は継続させる（読み込み側と同様、
    // 永続化の失敗でページ全体を壊さない）。
  }
};

/**
 * #1053: このチェック状態は `user_id` を含まない固定キーで永続化されるため、同一
 * ブラウザで別アカウントへログインし直すと前のユーザーの選択がそのまま引き継がれる。
 * `AuthProvider` の `SIGNED_OUT` ハンドラから呼び、ログアウト時に必ず空にする。
 */
export const clearCartCheckOffStorage = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 非致命: private browsing 等でlocalStorageにアクセスできない場合も、
    // ログアウト処理自体は継続させる。
  }
};

export interface UseCartCheckOffResult {
  /** カートに入れた（チェック済み）の shopping_list_items.id 集合。 */
  checkedIds: ReadonlySet<string>;
  /** 指定アイテムのチェック状態をトグルする。 */
  toggle: (id: string) => void;
  /** 指定アイテムのチェック状態を消す。購入確定・削除時に呼ぶ想定。 */
  clear: (id: string) => void;
}

/**
 * 買い物中モードの「カートに入れた」軽量チェックオフ（#983）。購入確定（PurchaseDialog
 * 経由の重いフロー）とは別の、店内でカートに入れた瞬間の軽い意思表示。サーバー同期は
 * せず端末内 localStorage にのみ保持し、セッションを跨いでも残る。購入確定・削除された
 * アイテムのチェック状態は呼び出し側（`_auth.shopping.tsx`）が clear() で個別に消す。
 */
export const useCartCheckOff = (): UseCartCheckOffResult => {
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(readStoredCheckedIds);

  const toggle = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeStoredCheckedIds(next);
      return next;
    });
  }, []);

  const clear = useCallback((id: string) => {
    setCheckedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      writeStoredCheckedIds(next);
      return next;
    });
  }, []);

  return { checkedIds, toggle, clear };
};
