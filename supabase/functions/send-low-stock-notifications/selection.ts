export interface LowStockRow {
  id: string;
  name: string;
  units: number;
  minimum_stock: number | null;
  opened_remaining: number | null;
  deleted_at: string | null;
  item_type: "food" | "daily_goods" | null;
  categories: { kind: "food" | "daily_goods" | null } | null;
}

/** Match the dashboard's units <= minimum_stock rule; only daily goods get this digest. */
export const selectLowStockDailyGoods = (rows: LowStockRow[]): LowStockRow[] =>
  rows.filter(
    (item) =>
      (item.item_type ?? item.categories?.kind ?? "food") === "daily_goods" &&
      item.deleted_at === null &&
      item.minimum_stock !== null &&
      item.units <= item.minimum_stock,
  );
