/**
 * 棚卸し写真チェック（シェルフスキャン、#927）向けの、クライアント側のみで完結する
 * 差分マッチングロジック。`shelf-scan` Edge Function が返した「写真に写っている
 * 商品名候補」と、選択中のカテゴリ/保管場所の既存 `items`（呼び出し側で
 * `deleted_at IS NULL` かつ `units > 0` に絞り込み済みの前提）を突き合わせ、
 * 以下2種類の候補を計算する（`docs/specs/features/shelf-scan.md`「スコープ」節）:
 *
 * - possiblyConsumed: システム上にあるが写真に写っていない（食べきった？候補）
 * - possiblyUnregistered: 写真にあるがシステムに未登録（未登録候補）
 *
 * 名前の類似度判定は #990 で追加された `similarItemMatch.ts` の
 * `findSimilarItem`（正規化 + Levenshtein距離）をそのまま再利用し、表記揺れ
 * 判定ロジックを重複実装しない。
 */
import { findSimilarItem, type SimilarItemCandidate } from "@/lib/similarItemMatch";

export interface ShelfScanMatchItem {
  id: string;
  name: string;
}

export interface ShelfScanMatchResult {
  /** システム上にあるが、写真の商品名候補のどれとも一致しなかった既存アイテム。 */
  possiblyConsumed: ShelfScanMatchItem[];
  /** 写真の商品名候補のうち、既存アイテムのどれとも一致しなかったもの。 */
  possiblyUnregistered: string[];
}

/**
 * `existingItems` と `photoCandidateNames` を突き合わせ、2種類の差分候補を返す。
 * 写真候補ごとに `findSimilarItem` で最も近い既存アイテムを探し、見つかれば
 * その既存アイテムを「写真に写っていた」ものとしてマークする。1つの既存
 * アイテムに複数の写真候補が一致してもマークは1回で十分なため、マッチした
 * アイテムIDの集合で管理する。
 */
export const matchShelfScanCandidates = (
  photoCandidateNames: string[],
  existingItems: ShelfScanMatchItem[],
): ShelfScanMatchResult => {
  const candidates: SimilarItemCandidate[] = existingItems;
  const matchedItemIds = new Set<string>();
  const matchedCandidateIndices = new Set<number>();

  photoCandidateNames.forEach((name, index) => {
    const match = findSimilarItem(candidates, name);
    if (!match) return;
    matchedItemIds.add(match.id);
    matchedCandidateIndices.add(index);
  });

  const possiblyConsumed = existingItems.filter((item) => !matchedItemIds.has(item.id));
  const possiblyUnregistered = photoCandidateNames.filter(
    (_, index) => !matchedCandidateIndices.has(index),
  );

  return { possiblyConsumed, possiblyUnregistered };
};
