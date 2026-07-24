import { getPricedEquivalentUnits } from "@/lib/inventoryValue";
import {
  type ExpiryStatus,
  getExpiryStatus,
  getLotRemainingAmount,
  type Item,
  roundFloat,
} from "@/types/item";

export interface CategoryStat {
  categoryId: string | null;
  name: string;
  count: number;
}

export interface CategoryValueStat {
  categoryId: string | null;
  name: string;
  /** カテゴリ内の在庫総額（円）。単価未設定のロットは含まれない。 */
  value: number;
}

export interface LotValueRow {
  item_id: string;
  units: number;
  opened_remaining?: number | null;
  unit_price: number | null;
}

export interface ExpiryDistributionEntry {
  status: ExpiryStatus;
  count: number;
}

interface UnitTotal {
  unit: string;
  total: number;
}

export interface MonthlyConsumptionEntry {
  month: string;
  totals: UnitTotal[];
}

export interface RawLog {
  delta_amount: number;
  delta_unit: string;
  occurred_at: string;
}

export const computeCategoryStats = (
  items: Pick<Item, "category_id" | "units">[],
  categoryMap: Record<string, string>,
): CategoryStat[] => {
  const countMap = new Map<string | null, number>();
  for (const item of items) {
    if (item.units === 0) continue;
    const key = item.category_id ?? null;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const stats: CategoryStat[] = [];
  for (const [categoryId, count] of countMap) {
    stats.push({
      categoryId,
      name: categoryId ? (categoryMap[categoryId] ?? "?") : "__uncategorized__",
      count,
    });
  }
  stats.sort((a, b) => b.count - a.count);
  return stats;
};

/**
 * ロット単位の在庫データからカテゴリ別在庫総額を計算する（#342）。
 * `unit_price` が null のロットは金額不明として除外する（後方互換）。
 * `itemCategoryMap` は `item_id → category_id | null` のマッピング。
 */
export const computeCategoryValueStats = (
  lots: LotValueRow[],
  itemCategoryMap: Record<string, string | null>,
  itemContentAmountMap: Record<string, number>,
  categoryMap: Record<string, string>,
): CategoryValueStat[] => {
  const valueMap = new Map<string | null, number>();
  for (const lot of lots) {
    if (lot.unit_price === null || lot.unit_price === undefined) continue;
    if (!Object.hasOwn(itemCategoryMap, lot.item_id)) continue;
    const contentAmount = itemContentAmountMap[lot.item_id];
    if (contentAmount === undefined) continue;
    const equivalentUnits = getPricedEquivalentUnits(lot, contentAmount);
    if (equivalentUnits <= 0) continue;
    const categoryId = itemCategoryMap[lot.item_id] ?? null;
    valueMap.set(categoryId, (valueMap.get(categoryId) ?? 0) + equivalentUnits * lot.unit_price);
  }

  const stats: CategoryValueStat[] = [];
  for (const [categoryId, value] of valueMap) {
    stats.push({
      categoryId,
      name: categoryId ? (categoryMap[categoryId] ?? "?") : "__uncategorized__",
      value: Math.round(value),
    });
  }
  stats.sort((a, b) => b.value - a.value);
  return stats;
};

export const computeExpiryDistribution = (
  items: Pick<Item, "units" | "expiry_date">[],
  warningDays?: number,
): ExpiryDistributionEntry[] => {
  const countMap = new Map<ExpiryStatus, number>();
  for (const item of items) {
    if (item.units === 0) continue;
    const status = getExpiryStatus(item.expiry_date, warningDays);
    countMap.set(status, (countMap.get(status) ?? 0) + 1);
  }

  const result: ExpiryDistributionEntry[] = [];
  const order: ExpiryStatus[] = ["expired", "expiring-soon", "ok", "unknown"];
  for (const status of order) {
    const count = countMap.get(status) ?? 0;
    if (count > 0) result.push({ status, count });
  }
  return result;
};

export const computeMonthlyConsumption = (
  logs: RawLog[],
  months = 6,
  now = new Date(),
): MonthlyConsumptionEntry[] => {
  const result: MonthlyConsumptionEntry[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = `${year}/${String(month + 1).padStart(2, "0")}`;

    const monthLogs = logs.filter((log) => {
      const logDate = new Date(log.occurred_at);
      return logDate.getFullYear() === year && logDate.getMonth() === month;
    });

    const unitTotals = new Map<string, number>();
    for (const log of monthLogs) {
      unitTotals.set(log.delta_unit, (unitTotals.get(log.delta_unit) ?? 0) + log.delta_amount);
    }

    // Keep a separate total per unit instead of collapsing to the single
    // most-common unit — mixing units in one sum would be meaningless, and
    // silently dropping the non-dominant units loses real consumption data.
    const totals: UnitTotal[] = [...unitTotals.entries()]
      .map(([unit, total]) => ({ unit, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    result.push({ month: label, totals });
  }

  return result;
};

// --- 消費ペース予測（補充タイミング予測 / 低在庫アラート強化 #68, #392） ---

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 予測残日数計算のデフォルト参照期間（日）。過去30日の消費実績を基準にする。 */
export const DEFAULT_FORECAST_LOOKBACK_DAYS = 30;

/** 参照期間内の消費ログがこの件数未満なら「データ不足」として扱う。 */
const MIN_LOGS_FOR_FORECAST = 2;

export interface ConsumptionPaceForecast {
  /** 参照期間内の1日あたり平均消費量。データ不足時は null。 */
  dailyRate: number | null;
  /** 予測残日数。在庫が既に0の場合は 0、データ不足の場合は null。 */
  predictedRemainingDays: number | null;
  /** 参照期間内に見つかった消費ログの件数（「データ不足（X回分の消費記録あり）」表示に使う）。 */
  logCount: number;
}

/**
 * アイテム1件の消費ログと現在の在庫量から、平均消費ペース（1日あたり）と予測残日数を計算する。
 *
 * - 在庫が0以下: 消費ペースに関わらず predictedRemainingDays = 0
 * - 参照期間 (lookbackDays) 内のログが `MIN_LOGS_FOR_FORECAST` 件未満、または合計消費量が0以下:
 *   データ不足として dailyRate / predictedRemainingDays は null（logCount のみ返す）
 * - それ以外: dailyRate = 参照期間内の合計消費量 / lookbackDays、
 *   predictedRemainingDays = floor(現在庫 / dailyRate)
 */
export const computeConsumptionPaceForecast = (
  logs: Pick<RawLog, "delta_amount" | "delta_unit" | "occurred_at">[],
  currentStock: number,
  stockUnit: string,
  lookbackDays = DEFAULT_FORECAST_LOOKBACK_DAYS,
  now = new Date(),
): ConsumptionPaceForecast => {
  const cutoff = new Date(now.getTime() - lookbackDays * MS_PER_DAY);
  const relevant = logs.filter((log) => {
    const occurredAt = new Date(log.occurred_at);
    return log.delta_unit === stockUnit && occurredAt >= cutoff && occurredAt <= now;
  });
  const logCount = relevant.length;

  if (currentStock <= 0) {
    return { dailyRate: null, predictedRemainingDays: 0, logCount };
  }

  const totalConsumed = relevant.reduce((sum, log) => sum + log.delta_amount, 0);
  if (logCount < MIN_LOGS_FOR_FORECAST || totalConsumed <= 0) {
    return { dailyRate: null, predictedRemainingDays: null, logCount };
  }

  const dailyRate = roundFloat(totalConsumed / lookbackDays);
  const predictedRemainingDays = Math.floor(currentStock / dailyRate);
  return { dailyRate, predictedRemainingDays, logCount };
};

export interface ItemConsumptionLogEntry {
  item_id: string;
  delta_amount: number;
  delta_unit: string;
  occurred_at: string;
}

type ConsumptionTrend = "accelerating" | "decelerating" | "steady" | "insufficient-data";

export interface ConsumptionSpeedEntry {
  itemId: string;
  /** 直近 windowDays 日間の1日あたり平均消費量 */
  dailyRate: number;
  unit: string;
  /** 直近 windowDays 日間のログ件数 */
  logCount: number;
  trend: ConsumptionTrend;
}

// 直前の期間比でこの倍率を超えて増えたら加速、下回ったら減速と判定する。
const TREND_ACCELERATION_RATIO = 1.2;
const TREND_DECELERATION_RATIO = 0.8;

/**
 * アイテムごとの消費速度ランキングを計算する。
 *
 * 直近 windowDays 日間の1日あたり平均消費量で降順ソートする。あわせて、その1つ前の
 * windowDays 日間（windowDays〜2*windowDays日前）と比較し、加速中 (accelerating) /
 * 減速中 (decelerating) / 横ばい (steady) を判定する。前の期間にログが無い場合は
 * 比較できないため insufficient-data とする。
 */
export const computeConsumptionSpeedRanking = (
  logs: ItemConsumptionLogEntry[],
  itemUnits: ReadonlyMap<string, string>,
  windowDays = DEFAULT_FORECAST_LOOKBACK_DAYS,
  now = new Date(),
): ConsumptionSpeedEntry[] => {
  const recentStart = new Date(now.getTime() - windowDays * MS_PER_DAY);
  const priorStart = new Date(now.getTime() - 2 * windowDays * MS_PER_DAY);

  const byItem = new Map<string, { recent: number[]; prior: number[] }>();
  for (const log of logs) {
    const unit = itemUnits.get(log.item_id);
    if (!unit || log.delta_unit !== unit) continue;
    const occurredAt = new Date(log.occurred_at);
    if (occurredAt > now) continue;
    const entry = byItem.get(log.item_id) ?? { recent: [], prior: [] };
    if (occurredAt >= recentStart) {
      entry.recent.push(log.delta_amount);
    } else if (occurredAt >= priorStart) {
      entry.prior.push(log.delta_amount);
    }
    byItem.set(log.item_id, entry);
  }

  const result: ConsumptionSpeedEntry[] = [];
  for (const [itemId, { recent, prior }] of byItem) {
    if (recent.length === 0) continue;
    const recentTotal = recent.reduce((sum, v) => sum + v, 0);
    const dailyRate = roundFloat(recentTotal / windowDays);

    let trend: ConsumptionTrend = "insufficient-data";
    if (prior.length > 0) {
      const priorTotal = prior.reduce((sum, v) => sum + v, 0);
      const priorDailyRate = priorTotal / windowDays;
      if (dailyRate > priorDailyRate * TREND_ACCELERATION_RATIO) {
        trend = "accelerating";
      } else if (dailyRate < priorDailyRate * TREND_DECELERATION_RATIO) {
        trend = "decelerating";
      } else {
        trend = "steady";
      }
    }

    const unit = itemUnits.get(itemId);
    if (!unit) continue;
    result.push({ itemId, dailyRate, unit, logCount: recent.length, trend });
  }

  result.sort((a, b) => b.dailyRate - a.dailyRate);
  return result;
};

export interface ForecastAlertEntry {
  itemId: string;
  predictedRemainingDays: number;
}

/**
 * 在庫があるアイテムのうち、消費ペースからの予測残日数が thresholdDays 以内のものを抽出する。
 * `minimum_stock` による既存の低在庫バナー（#230/#382）とは独立した、消費ペースベースの予測。
 * 予測残日数が短い順（=急ぐ順）にソートして返す。
 */
export const computeForecastAlerts = (
  items: Array<Pick<Item, "id" | "units" | "content_amount" | "content_unit" | "opened_remaining">>,
  logs: ItemConsumptionLogEntry[],
  thresholdDays: number,
  lookbackDays = DEFAULT_FORECAST_LOOKBACK_DAYS,
  now = new Date(),
): ForecastAlertEntry[] => {
  const logsByItem = new Map<string, ItemConsumptionLogEntry[]>();
  for (const log of logs) {
    const arr = logsByItem.get(log.item_id) ?? [];
    arr.push(log);
    logsByItem.set(log.item_id, arr);
  }

  const alerts: ForecastAlertEntry[] = [];
  for (const item of items) {
    if (item.units <= 0) continue;
    const stock = getLotRemainingAmount(
      item.units,
      item.content_amount,
      item.opened_remaining ?? null,
    );
    const forecast = computeConsumptionPaceForecast(
      logsByItem.get(item.id) ?? [],
      stock,
      item.content_unit,
      lookbackDays,
      now,
    );
    if (
      forecast.predictedRemainingDays !== null &&
      forecast.predictedRemainingDays <= thresholdDays
    ) {
      alerts.push({ itemId: item.id, predictedRemainingDays: forecast.predictedRemainingDays });
    }
  }

  alerts.sort((a, b) => a.predictedRemainingDays - b.predictedRemainingDays);
  return alerts;
};

export interface ItemConsumptionPace {
  /** 直近 `months` ヶ月分の月次消費量（アイテム詳細のミニグラフ表示用） */
  monthly: MonthlyConsumptionEntry[];
  /** 直近 `months` ヶ月の平均消費量（`unit` あたり/月）。対象ログが無ければ0 */
  averagePerMonth: number;
  /** averagePerMonth / 月次グラフで使う単位。対象ログが無ければnull */
  unit: string | null;
  /** 現在の在庫量 ÷ 週あたり消費ペースで算出した推定残り週数。
   *  ペースを算出できない場合はnull、消費ペースはあるが在庫が0の場合は0 */
  estimatedWeeksRemaining: number | null;
}

const DAYS_PER_MONTH = 30;
const DAYS_PER_WEEK = 7;

/**
 * 単一アイテムの消費ログから、直近 `months` ヶ月分の消費ペースを算出する（issue #327）。
 * 1) `consumption_logs` を月次集計（`computeMonthlyConsumption` を再利用）
 * 2) 直近 `months` ヶ月の平均消費ペース（unit/月）を算出
 * 3) 現在の在庫量 ÷ 週あたり平均消費ペース = 推定残り週数
 *
 * `currentStock` は `content_unit` 換算の総在庫量（例: `getLotRemainingAmount()` の結果）で渡すこと。
 */
export const computeItemConsumptionPace = (
  logs: RawLog[],
  currentStock: number,
  stockUnit: string,
  months = 3,
  now = new Date(),
): ItemConsumptionPace => {
  const matchingLogs = logs.filter((log) => log.delta_unit === stockUnit);
  const monthly = computeMonthlyConsumption(matchingLogs, months, now);

  const unitTotals = new Map<string, number>();
  for (const entry of monthly) {
    for (const { unit, total } of entry.totals) {
      unitTotals.set(unit, roundFloat((unitTotals.get(unit) ?? 0) + total));
    }
  }

  if (unitTotals.size === 0) {
    return { monthly, averagePerMonth: 0, unit: null, estimatedWeeksRemaining: null };
  }

  const total = unitTotals.get(stockUnit) ?? 0;
  const unit = stockUnit;
  const averagePerMonth = roundFloat(total / months);

  if (averagePerMonth <= 0) {
    return { monthly, averagePerMonth: 0, unit, estimatedWeeksRemaining: null };
  }

  if (currentStock <= 0) {
    return { monthly, averagePerMonth, unit, estimatedWeeksRemaining: 0 };
  }

  const averagePerWeek = averagePerMonth / (DAYS_PER_MONTH / DAYS_PER_WEEK);
  // Round to 1 decimal place for a readable "約X週" display.
  const estimatedWeeksRemaining = Math.round((currentStock / averagePerWeek) * 10) / 10;

  return { monthly, averagePerMonth, unit, estimatedWeeksRemaining };
};

// --- Food-waste dashboard (#494) ---

interface WasteCategoryCount {
  categoryId: string | null;
  name: string;
  count: number;
}

export interface MonthlyWasteEntry {
  month: string;
  total: number;
  byCategory: WasteCategoryCount[];
}

/** ソフトデリート済みアイテムのうち `deletion_reason = 'expired_waste'` のもの。
 *  `deleted_at` は呼び出し側のクエリで NOT NULL に絞り込み済み。 */
export interface RawWasteItem {
  category_id: string | null;
  deleted_at: string;
}

/** 月別・カテゴリ別の廃棄件数を集計する（食品ロスダッシュボード用）。
 *  `computeMonthlyConsumption` と同じ「直近 N ヶ月を新しい順に並べる」方針に揃えている。
 *  unit_price（#342, 未マージ）が入るまでは金額換算せず件数のみを対象にする。 */
export const computeMonthlyWasteStats = (
  items: RawWasteItem[],
  categoryMap: Record<string, string>,
  months = 6,
  now = new Date(),
): MonthlyWasteEntry[] => {
  const result: MonthlyWasteEntry[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = `${year}/${String(month + 1).padStart(2, "0")}`;

    const monthItems = items.filter((item) => {
      const deletedAt = new Date(item.deleted_at);
      return deletedAt.getFullYear() === year && deletedAt.getMonth() === month;
    });

    const countMap = new Map<string | null, number>();
    for (const item of monthItems) {
      const key = item.category_id ?? null;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    const byCategory: WasteCategoryCount[] = [...countMap.entries()]
      .map(([categoryId, count]) => ({
        categoryId,
        name: categoryId ? (categoryMap[categoryId] ?? "?") : "__uncategorized__",
        count,
      }))
      .sort((a, b) => b.count - a.count);

    result.push({ month: label, total: monthItems.length, byCategory });
  }

  return result;
};
