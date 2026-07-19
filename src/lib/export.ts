import type { Category, Item, StorageLocation } from "@/types/item";

/**
 * データエクスポート機能（#66 / #358 / #381）の純粋関数群。
 * DOM API（Blob / URL.createObjectURL）に依存するのは `downloadTextFile` のみで、
 * それ以外はすべてテスト容易な純関数として実装する。
 */

// --- CSV encoding helpers ---

/** Excel（特に日本語版）が UTF-8 CSV を文字化けせず開けるよう先頭に付与する BOM。 */
const CSV_BOM = "﻿";

const escapeCsvField = (value: string): string => {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const toCsvLine = (fields: (string | number | null | undefined)[]): string =>
  fields
    .map((field) => escapeCsvField(field === null || field === undefined ? "" : String(field)))
    .join(",");

const buildCsv = (header: string[], rows: (string | number | null | undefined)[][]): string => {
  const lines = [toCsvLine(header), ...rows.map((row) => toCsvLine(row))];
  return CSV_BOM + lines.join("\r\n");
};

// --- Items export (#358) ---

/** #358 で指定されたヘッダー。CSV はスプレッドシート用の固定フォーマットとして
 *  UI 言語に関わらず日本語ヘッダーを既定とする（呼び出し側で上書き可能）。 */
export const DEFAULT_ITEMS_CSV_HEADER = [
  "名前",
  "バーコード",
  "カテゴリ",
  "保管場所",
  "個数",
  "内容量",
  "単位",
  "期限",
  "購入日",
  "メモ",
] as const;

export const itemsToCSV = (
  items: Item[],
  categories: Pick<Category, "id" | "name">[],
  locations: Pick<StorageLocation, "id" | "name">[],
  header: string[] = [...DEFAULT_ITEMS_CSV_HEADER],
): string => {
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const locationMap = new Map(locations.map((l) => [l.id, l.name]));

  const rows = items.map((item) => [
    item.name,
    item.barcode ?? "",
    item.category_id ? (categoryMap.get(item.category_id) ?? "") : "",
    item.storage_location_id ? (locationMap.get(item.storage_location_id) ?? "") : "",
    item.units,
    item.content_amount,
    item.content_unit,
    item.expiry_date ?? "",
    item.purchase_date ?? "",
    item.notes ?? "",
  ]);

  return buildCsv(header, rows);
};

export interface ItemsExportPayload {
  exported_at: string;
  version: 1;
  items: Item[];
}

/** #358: `{exported_at, version, items: [...]}` 形式のバックアップ用 JSON を生成する。 */
export const itemsToJSON = (items: Item[], now: () => Date = () => new Date()): string => {
  const payload: ItemsExportPayload = {
    exported_at: now().toISOString(),
    version: 1,
    items,
  };
  return JSON.stringify(payload, null, 2);
};

// --- Consumption / purchase history export (#381) ---

export type ExportPeriod = "30d" | "90d" | "all";

export type HistoryExportType = "consumption" | "purchase";

export interface HistoryExportRow {
  type: HistoryExportType;
  /** YYYY-MM-DD */
  date: string;
  itemName: string;
  categoryName: string;
  amount: number;
  unit: string;
  notes: string;
}

export interface ExportConsumptionLogInput {
  item_id: string;
  delta_amount: number;
  delta_unit: string;
  occurred_at: string;
}

export interface ExportPurchaseLotInput {
  item_id: string;
  units: number;
  purchase_date: string | null;
}

export interface ExportItemLookup {
  name: string;
  category_id?: string | null;
  notes?: string | null;
  content_unit?: string;
}

const resolveCategoryName = (
  item: ExportItemLookup | undefined,
  categoryMap: Map<string, string>,
): string => (item?.category_id ? (categoryMap.get(item.category_id) ?? "") : "");

/** `consumption_logs` の生データを履歴エクスポート用の行に変換する。 */
export const buildConsumptionHistoryRows = (
  logs: ExportConsumptionLogInput[],
  itemMap: Map<string, ExportItemLookup>,
  categoryMap: Map<string, string>,
): HistoryExportRow[] =>
  logs.map((log) => {
    const item = itemMap.get(log.item_id);
    return {
      type: "consumption",
      date: log.occurred_at.slice(0, 10),
      itemName: item?.name ?? "",
      categoryName: resolveCategoryName(item, categoryMap),
      amount: log.delta_amount,
      unit: log.delta_unit,
      notes: item?.notes ?? "",
    };
  });

/** `item_lots` の生データを購入履歴エクスポート用の行に変換する（`purchase_date` の無いロットは除外）。 */
export const buildPurchaseHistoryRows = (
  lots: ExportPurchaseLotInput[],
  itemMap: Map<string, ExportItemLookup>,
  categoryMap: Map<string, string>,
): HistoryExportRow[] =>
  lots
    .filter((lot): lot is ExportPurchaseLotInput & { purchase_date: string } => !!lot.purchase_date)
    .map((lot) => {
      const item = itemMap.get(lot.item_id);
      return {
        type: "purchase",
        date: lot.purchase_date.slice(0, 10),
        itemName: item?.name ?? "",
        categoryName: resolveCategoryName(item, categoryMap),
        amount: lot.units,
        unit: item?.content_unit ?? "",
        notes: item?.notes ?? "",
      };
    });

const PERIOD_DAYS: Record<Exclude<ExportPeriod, "all">, number> = {
  "30d": 30,
  "90d": 90,
};

/** 期間指定の起点日（その日を含む）を YYYY-MM-DD で返す。"all" の場合は null。 */
export const getPeriodStartDate = (
  period: ExportPeriod,
  now: () => Date = () => new Date(),
): string | null => {
  if (period === "all") return null;
  const d = now();
  d.setDate(d.getDate() - PERIOD_DAYS[period]);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** `date`（YYYY-MM-DD）が期間指定の範囲内かどうかで行をフィルタする。 */
export const filterHistoryRowsByPeriod = (
  rows: HistoryExportRow[],
  period: ExportPeriod,
  now: () => Date = () => new Date(),
): HistoryExportRow[] => {
  const startDate = getPeriodStartDate(period, now);
  if (!startDate) return rows;
  return rows.filter((row) => row.date >= startDate);
};

/** #381 で指定されたヘッダー（種別列を先頭に追加し、消費/購入を1つのCSVで扱えるようにしている）。 */
export const DEFAULT_HISTORY_CSV_HEADER = [
  "種別",
  "日付",
  "アイテム名",
  "カテゴリ",
  "数量",
  "単位",
  "メモ",
] as const;

export const DEFAULT_HISTORY_TYPE_LABELS: Record<HistoryExportType, string> = {
  consumption: "消費",
  purchase: "購入",
};

export const historyRowsToCSV = (
  rows: HistoryExportRow[],
  header: string[] = [...DEFAULT_HISTORY_CSV_HEADER],
  typeLabels: Record<HistoryExportType, string> = DEFAULT_HISTORY_TYPE_LABELS,
): string => {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const csvRows = sorted.map((row) => [
    typeLabels[row.type],
    row.date,
    row.itemName,
    row.categoryName,
    row.amount,
    row.unit,
    row.notes,
  ]);
  return buildCsv(header, csvRows);
};

// --- Download side effect (kept separate from the pure functions above) ---

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ファイル名用の `base-YYYYMMDD.ext` を組み立てる純関数。 */
export const buildExportFilename = (
  base: string,
  extension: string,
  now: () => Date = () => new Date(),
): string => {
  const d = now();
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  return `${base}-${stamp}.${extension}`;
};

/** `Blob` + `URL.createObjectURL` でファイルダウンロードを発火する。DOM 依存のためテスト対象外。 */
export const downloadTextFile = (content: string, filename: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
};
