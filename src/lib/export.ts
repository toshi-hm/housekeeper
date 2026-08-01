import { z } from "zod";

import type { Category, Item, StorageLocation } from "@/types/item";

/**
 * データエクスポート機能（#66 / #358 / #381）の純粋関数群。
 * DOM API（Blob / URL.createObjectURL）に依存するのは `downloadTextFile` のみで、
 * それ以外はすべてテスト容易な純関数として実装する。
 */

// --- CSV encoding helpers ---

/** Excel（特に日本語版）が UTF-8 CSV を文字化けせず開けるよう先頭に付与する BOM。 */
const CSV_BOM = "﻿";

/** スプレッドシートソフトが数式として評価しうる先頭文字（CSVインジェクション対策、#677）。 */
const FORMULA_TRIGGER_CHARS = /^[=+\-@]/;

const escapeCsvField = (value: string): string => {
  // 外部API由来の値（バーコード検索結果の商品名等）がそのままセルに入り得るため、
  // 数式と解釈される先頭文字にはシングルクオートを付与して無害化する（#677）。
  const sanitized = FORMULA_TRIGGER_CHARS.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
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

/** 1ロット分のバックアップ用データ。`item_lots` の実体をそのまま持ち回る（#693）。 */
export interface ItemLotExport {
  units: number;
  opened_remaining: number | null;
  unit_price: number | null;
  purchase_date: string | null;
  expiry_date: string | null;
}

interface ItemExportV2 {
  name: string;
  barcode: string | null;
  content_amount: number;
  content_unit: string;
  notes: string | null;
  minimum_stock: number | null;
  auto_reorder: boolean;
  reorder_threshold: number | null;
  lots: ItemLotExport[];
}

interface ItemsExportPayloadV2 {
  exported_at: string;
  version: 2;
  items: ItemExportV2[];
}

/**
 * #693: `items` テーブルの行（＝`item_lots` から再計算される集約値。複数ロットが
 * あるアイテムは `expiry_date` が最も早い1件しか残らない）をそのままバックアップに
 * 書き出すと、ロット単位の期限・購入日・数量が失われる。v2 ではロット配列
 * （`lotsByItemId`）をアイテムごとに個別に持たせ、ロットの粒度を保持する。
 * 復元側（`jsonToItems`）は引き続き旧 v1 形式も読み込める。
 */
export const itemsToJSON = (
  items: Item[],
  lotsByItemId: Map<string, ItemLotExport[]>,
  now: () => Date = () => new Date(),
): string => {
  const payload: ItemsExportPayloadV2 = {
    exported_at: now().toISOString(),
    version: 2,
    items: items.map((item) => ({
      name: item.name,
      barcode: item.barcode ?? null,
      content_amount: item.content_amount,
      content_unit: item.content_unit,
      notes: item.notes ?? null,
      minimum_stock: item.minimum_stock ?? null,
      auto_reorder: item.auto_reorder ?? false,
      reorder_threshold: item.reorder_threshold ?? null,
      // 通常は全アイテムが >=1 件のロットを持つが、取得漏れ等で空だった場合に
      // 備え、アイテム自身の集約値を1ロットとしてフォールバックする。
      lots: lotsByItemId.get(item.id) ?? [
        {
          units: item.units,
          opened_remaining: item.opened_remaining ?? null,
          unit_price: null,
          purchase_date: item.purchase_date ?? null,
          expiry_date: item.expiry_date ?? null,
        },
      ],
    })),
  };
  return JSON.stringify(payload, null, 2);
};

// --- Items import (#657) ---

/** 1ロット分のインポート入力。`createLot` にほぼそのまま渡せる形。 */
const importLotSchema = z.object({
  units: z.number().int().min(0),
  opened_remaining: z.number().min(0).nullable().optional(),
  unit_price: z.number().int().min(0).nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
});

type ImportLotInput = z.infer<typeof importLotSchema>;

/**
 * インポート対象として受け入れるアイテムのフィールド。`category_id` /
 * `storage_location_id` は別プロジェクトへの移行時には無効な参照になる
 * （現プロジェクトの categories/storage_locations テーブルに存在しない
 * ID を指すため FK 違反になる）ため、意図的に取り込まない。カテゴリ・
 * 保管場所はインポート後に手動で再設定する運用とする。
 */
const importItemBaseSchema = z.object({
  name: z.string().min(1),
  barcode: z.string().nullable().optional(),
  content_amount: z.number().positive(),
  content_unit: z.string().min(1),
  notes: z.string().nullable().optional(),
  minimum_stock: z.number().int().min(0).nullable().optional(),
  auto_reorder: z.boolean().optional(),
  reorder_threshold: z.number().int().min(0).nullable().optional(),
});

/** v1: ロットの区別がなく、アイテム行自体が単一ロット相当の集約値を持つ旧形式。 */
const importItemV1Schema = importItemBaseSchema.extend({
  units: z.number().int().min(0),
  opened_remaining: z.number().min(0).nullable().optional(),
  purchase_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
});

/** v2: ロット配列を明示的に持つ形式（#693）。 */
const importItemV2Schema = importItemBaseSchema.extend({
  lots: z.array(importLotSchema).min(1),
});

/** パース後、呼び出し側（`useImportItems`）が扱う正規化済みの形。v1/v2どちらの
 *  ソースから読み込んでも、常に `lots` 配列を持つ。 */
export interface ImportItemInput {
  name: string;
  barcode?: string | null;
  content_amount: number;
  content_unit: string;
  notes?: string | null;
  minimum_stock?: number | null;
  auto_reorder?: boolean;
  reorder_threshold?: number | null;
  lots: ImportLotInput[];
}

const importPayloadV1Schema = z.object({
  exported_at: z.string(),
  version: z.literal(1),
  items: z.array(importItemV1Schema),
});

const importPayloadV2Schema = z.object({
  exported_at: z.string(),
  version: z.literal(2),
  items: z.array(importItemV2Schema),
});

/** `jsonToItems` が投げるエラーの理由。i18n キーの切り替えに使う (Key Map パターン)。 */
export type ImportParseErrorReason = "invalid_json" | "invalid_format";

export class ImportParseError extends Error {
  readonly reason: ImportParseErrorReason;
  constructor(reason: ImportParseErrorReason) {
    super(`Failed to parse import file: ${reason}`);
    this.reason = reason;
  }
}

const normalizeV2Item = (item: z.infer<typeof importItemV2Schema>): ImportItemInput => ({
  name: item.name,
  barcode: item.barcode,
  content_amount: item.content_amount,
  content_unit: item.content_unit,
  notes: item.notes,
  minimum_stock: item.minimum_stock,
  auto_reorder: item.auto_reorder,
  reorder_threshold: item.reorder_threshold,
  lots: item.lots,
});

const normalizeV1Item = (item: z.infer<typeof importItemV1Schema>): ImportItemInput => ({
  name: item.name,
  barcode: item.barcode,
  content_amount: item.content_amount,
  content_unit: item.content_unit,
  notes: item.notes,
  minimum_stock: item.minimum_stock,
  auto_reorder: item.auto_reorder,
  reorder_threshold: item.reorder_threshold,
  lots: [
    {
      units: item.units,
      opened_remaining: item.opened_remaining ?? null,
      unit_price: null,
      purchase_date: item.purchase_date ?? null,
      expiry_date: item.expiry_date ?? null,
    },
  ],
});

/**
 * `itemsToJSON` が生成したバックアップ JSON をパース・検証する（#657 / #693）。
 * v2（ロット配列を持つ現行形式）を優先して試し、失敗したら旧 v1（アイテム単位の
 * 集約値のみ）として読み込む。どちらでも合わなければ不正な JSON /
 * 想定外の形式として `ImportParseError` を投げる。
 */
export const jsonToItems = (jsonText: string): ImportItemInput[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new ImportParseError("invalid_json");
  }

  const v2 = importPayloadV2Schema.safeParse(parsed);
  if (v2.success) return v2.data.items.map(normalizeV2Item);

  const v1 = importPayloadV1Schema.safeParse(parsed);
  if (v1.success) return v1.data.items.map(normalizeV1Item);

  throw new ImportParseError("invalid_format");
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
  purchased_units: number;
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
        amount: lot.purchased_units,
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

const DEFAULT_HISTORY_TYPE_LABELS: Record<HistoryExportType, string> = {
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
