/**
 * 類似アイテム名のマージ提案（#990）向けの、クライアント側のみで完結する簡易
 * 類似度判定。外部API・DBアクセスは行わず、既に読み込み済みの `useItems()` の
 * 結果に対して同期的に計算する（`docs/specs/features/similar-item-suggestion.md`）。
 */

export interface SimilarItemCandidate {
  id: string;
  name: string;
}

export interface SimilarItemMatch extends SimilarItemCandidate {
  distance: number;
}

/**
 * 全角/半角・大文字小文字・前後や中間の空白による表記揺れを吸収するための
 * 前処理。かな/カナ統一など意味的な正規化は v1 のスコープ外（spec参照）。
 */
export const normalizeItemName = (name: string): string =>
  name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "");

/** 標準的な編集距離（挿入・削除・置換）。 */
export const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          currentRow[j - 1]! + 1, // 挿入
          previousRow[j]! + 1, // 削除
          previousRow[j - 1]! + substitutionCost, // 置換
        ),
      );
    }
    previousRow = currentRow;
  }

  return previousRow[b.length]!;
};

/**
 * 正規化後の文字数差がこの割合を超える候補は、Levenshtein計算を行うまでもなく
 * 「似ていない」とみなして事前に除外する（在庫件数が多い場合の計算コスト対策）。
 */
const MAX_LENGTH_DIFF_RATIO = 0.4;

/** 編集距離 / 長い方の文字数 がこの比率以下なら「似ている」と判定する。 */
const MAX_DISTANCE_RATIO = 0.34;

/**
 * `candidates` の中から `queryName` に最も似ているものを1件返す（無ければ
 * `null`）。完全一致（正規化後）も対象に含む — 「同じ商品を登録しようとして
 * いる」ことへの気づきも、表記揺れの気づきと同様に価値があるため。
 */
export const findSimilarItem = (
  candidates: SimilarItemCandidate[],
  queryName: string,
): SimilarItemMatch | null => {
  const normalizedQuery = normalizeItemName(queryName);
  if (!normalizedQuery) return null;

  let best: SimilarItemMatch | null = null;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeItemName(candidate.name);
    if (!normalizedCandidate) continue;

    const longerLength = Math.max(normalizedCandidate.length, normalizedQuery.length);
    const lengthDiff = Math.abs(normalizedCandidate.length - normalizedQuery.length);
    if (lengthDiff / longerLength > MAX_LENGTH_DIFF_RATIO) continue;

    const distance = levenshteinDistance(normalizedQuery, normalizedCandidate);
    if (distance / longerLength > MAX_DISTANCE_RATIO) continue;

    if (!best || distance < best.distance) {
      best = { id: candidate.id, name: candidate.name, distance };
    }
  }

  return best;
};
