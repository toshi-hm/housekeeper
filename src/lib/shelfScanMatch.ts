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
 * `findSimilarItem`（正規化 + Levenshtein距離）をベースに再利用し、表記揺れ
 * 判定ロジックを重複実装しない。ただし #1025 で判明した通り、シェルフスキャンの
 * Gemini プロンプトはパッケージ表記から読み取れる範囲でブランド名込みの具体的な
 * 商品名を返す一方、ユーザー登録の `items.name` はそこまで詳細でないことが多い
 * （例:「牛乳」 vs. OCR側「明治おいしい牛乳 1000ml」）。この文字数差は
 * `findSimilarItem` の事前フィルタ（`MAX_LENGTH_DIFF_RATIO`）を容易に超えてしまい
 * 表記揺れとして拾えないため、`findSimilarItem` で見つからなかった場合のみ、
 * シェルフスキャン専用の追加判定として「正規化後の包含関係（`includes`）」も見る
 * （`findContainedItem`）。この追加ロジックは shelfScanMatch 内に閉じており、
 * `findSimilarItem` 自体の挙動・他の呼び出し元（`SimilarItemSuggestion` /
 * `ItemForm`、#990）には影響しない。
 */
import {
  findSimilarItem,
  normalizeItemName,
  type SimilarItemCandidate,
} from "@/lib/similarItemMatch";

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
 * 正規化後の文字数が1文字などの極端に短い名前は、無関係な語にも容易に包含され
 * 誤マッチしやすいため、包含判定の対象から除外する下限値。
 */
const MIN_CONTAINMENT_LENGTH = 2;

/**
 * `findSimilarItem`（表記揺れ検出、#990）では拾えない、シェルフスキャン特有の
 * 「詳細度の差」によるマッチ漏れを補うための追加判定（#1025）。正規化後の
 * どちらか一方の文字列が他方を包含していれば、同一商品とみなす（例:
 * 登録名「牛乳」⊂ OCR名「明治おいしい牛乳1000ml」）。候補が複数ある場合は
 * 文字数差が最も小さいもの（＝最も詳細度が近いもの）を採用する。
 */
const findContainedItem = (
  candidates: SimilarItemCandidate[],
  queryName: string,
): SimilarItemCandidate | null => {
  const normalizedQuery = normalizeItemName(queryName);
  if (normalizedQuery.length < MIN_CONTAINMENT_LENGTH) return null;

  let best: SimilarItemCandidate | null = null;
  let bestLengthDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeItemName(candidate.name);
    if (normalizedCandidate.length < MIN_CONTAINMENT_LENGTH) continue;

    const isContained =
      normalizedCandidate.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedCandidate);
    if (!isContained) continue;

    const lengthDiff = Math.abs(normalizedCandidate.length - normalizedQuery.length);
    if (lengthDiff < bestLengthDiff) {
      best = candidate;
      bestLengthDiff = lengthDiff;
    }
  }

  return best;
};

/**
 * `existingItems` と `photoCandidateNames` を突き合わせ、2種類の差分候補を返す。
 * 写真候補ごとにまず `findSimilarItem` で表記揺れ込みの近い既存アイテムを探し、
 * 見つからなければ `findContainedItem` で詳細度の差（包含関係）によるマッチを
 * 試みる。見つかれば、その既存アイテムを「写真に写っていた」ものとしてマークする。
 * 1つの既存アイテムに複数の写真候補が一致してもマークは1回で十分なため、
 * マッチしたアイテムIDの集合で管理する。
 */
export const matchShelfScanCandidates = (
  photoCandidateNames: string[],
  existingItems: ShelfScanMatchItem[],
): ShelfScanMatchResult => {
  const candidates: SimilarItemCandidate[] = existingItems;
  const matchedItemIds = new Set<string>();
  const matchedCandidateIndices = new Set<number>();

  photoCandidateNames.forEach((name, index) => {
    const match = findSimilarItem(candidates, name) ?? findContainedItem(candidates, name);
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
