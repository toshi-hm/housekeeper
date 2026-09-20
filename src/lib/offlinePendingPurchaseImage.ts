import { clear, createStore, del, get, set } from "idb-keyval";

interface StoredPendingImage {
  name: string;
  type: string;
  data: ArrayBuffer;
}

const pendingImageStore = createStore("housekeeper-offline-images", "pending-purchase-images");

/**
 * #1020: 買い物中モードのオフラインキュー（`useOfflineActionQueue`）に積んだ「購入確定」に
 * 添付された画像は、キュー自体（`localStorage`永続化の `PurchaseInput`）には含められない
 * （File を直列化するのは現実的でなく、キューは再接続まで長時間残り得るため容量面でも
 * 不向き）。そのため、画像だけは別途 IndexedDB（`idb-keyval`、`queryClient.ts` の
 * 永続化ストアと同じライブラリ、ただし別データベース）へキューのアクションidをキーに
 * 保存し、リプレイ成功後にアップロードしてから取り除く。
 *
 * File/Blob をそのまま保存すると環境によって構造化複製が不安定なため、`ArrayBuffer` +
 * ファイル名/MIMEタイプへ分解して保存し、取り出し時に `File` を再構築する。
 *
 * IndexedDBが使えない環境（private browsing等）では画像は保存されず静かに失われる —
 * 呼び出し元は購入確定自体のキューイング（`localStorage`側）は継続する。
 */
export const storePendingPurchaseImage = async (actionId: string, file: File): Promise<void> => {
  try {
    const data = await file.arrayBuffer();
    await set(actionId, { name: file.name, type: file.type, data }, pendingImageStore);
  } catch {
    // 非致命: 画像だけが失われる
  }
};

/** 保存されていれば取り出して削除する。呼び出し元でのアップロード後の後始末は不要。 */
export const takePendingPurchaseImage = async (actionId: string): Promise<File | null> => {
  try {
    const stored = await get<StoredPendingImage>(actionId, pendingImageStore);
    await del(actionId, pendingImageStore);
    if (!stored) return null;
    return new File([stored.data], stored.name, { type: stored.type });
  } catch {
    return null;
  }
};

/** アクションが手動破棄・恒久的エラー等でリプレイされずに諦められた際、孤立した保存分を消す。 */
export const discardPendingPurchaseImage = async (actionId: string): Promise<void> => {
  try {
    await del(actionId, pendingImageStore);
  } catch {
    // 非致命
  }
};

/**
 * #1085: `offlineActionQueue.ts` の `clearOfflineActionQueue()`（ログアウト時に
 * localStorage側のキューを丸ごと消す）と対になる、このストア側の全件クリア。
 * キューが残ったままログアウトすると、その中の `purchase` アクションが参照していた
 * `actionId` ごと失われるため、`actionId` 単位の `discardPendingPurchaseImage` では
 * 後から個別に辿れず孤立してしまう。ストア自体を丸ごと消してよい（次のユーザー分を
 * 含め、このストアに現在ログイン中のユーザーが取り出しを待っている画像は無い前提 —
 * 呼び出しは `AuthProvider.tsx` の `SIGNED_OUT` ハンドラのみ）。
 */
export const clearAllPendingPurchaseImages = async (): Promise<void> => {
  try {
    await clear(pendingImageStore);
  } catch {
    // 非致命
  }
};
