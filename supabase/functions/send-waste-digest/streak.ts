export interface WasteStreakState {
  current_streak_weeks: number;
  longest_streak_weeks: number;
}

/**
 * 対象週の廃棄件数から、次のストリーク状態を計算する（#925）。
 * - 対象週の廃棄件数が0: current_streak_weeksを+1し、longest_streak_weeksが
 *   それを下回っていれば更新する
 * - 0件でない: current_streak_weeksを0にリセットする（longest_streak_weeksは
 *   これまでの最長記録として保持し続ける）
 *
 * Supabaseクライアントに依存しない純粋関数として切り出し、単体テストで
 * ストリーク遷移ロジックだけを検証できるようにする。
 */
export const computeNextWasteStreak = (
  prev: WasteStreakState,
  currentWeekWasteCount: number,
): WasteStreakState => {
  const nextCurrent = currentWeekWasteCount === 0 ? prev.current_streak_weeks + 1 : 0;
  const nextLongest = Math.max(prev.longest_streak_weeks, nextCurrent);
  return { current_streak_weeks: nextCurrent, longest_streak_weeks: nextLongest };
};

/**
 * 対象週(`targetWeekStart`, "YYYY-MM-DD"のMonday)が、DBに記録済みの
 * `last_evaluated_week` と異なる場合のみストリークを評価してよい。
 *
 * 専用のログテーブルは新設せず、waste_streaks.last_evaluated_week 自体を
 * 週次バッチの重複実行防止（dedup）に使う（1週間に1回だけ評価される）。
 * これは既存の notification_logs（送信日でのユニーク制約）と同じ「バッチの
 * 実行単位ごとに1回だけ確定させる」考え方を、新しいテーブルを増やさずに
 * waste_streaks 自身の列で実現したもの。
 */
export const shouldEvaluateWasteWeek = (
  lastEvaluatedWeek: string | null,
  targetWeekStart: string,
): boolean => lastEvaluatedWeek !== targetWeekStart;
