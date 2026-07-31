import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createLot, LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import type { ImportItemInput } from "@/lib/export";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { fetchAllPages } from "@/lib/supabasePagination";
import { useToast } from "@/lib/toast-context";

/** 既存アイテムとバーコードが一致した場合の扱い（#657）。 */
export type ImportDuplicateStrategy = "skip" | "overwrite" | "duplicate";

export interface ImportItemsInput {
  items: ImportItemInput[];
  duplicateStrategy: ImportDuplicateStrategy;
}

export interface ImportItemsResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

/** `useImportItems` の実処理。単体テストのため素の関数として切り出している。 */
export const importItems = async ({
  items,
  duplicateStrategy,
}: ImportItemsInput): Promise<ImportItemsResult> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const userId = userData.user.id;

  // バーコードによる重複検出用に、既存のアクティブなアイテムを引く（#657）。
  const existingRows = await fetchAllPages<{ id: string; barcode: string | null }>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("items")
        .select("id, barcode")
        .is("deleted_at", null)
        .not("barcode", "is", null)
        .range(from, to);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; barcode: string | null }[];
    },
  );
  const existingIdByBarcode = new Map(
    existingRows.filter((row) => row.barcode).map((row) => [row.barcode as string, row.id]),
  );

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    const existingId = item.barcode ? existingIdByBarcode.get(item.barcode) : undefined;

    if (existingId && duplicateStrategy === "skip") {
      skippedCount += 1;
      continue;
    }

    if (existingId && duplicateStrategy === "overwrite") {
      // 数量・期限・開封残量はロット単位で管理されているため、items 行を
      // 直接上書きするのではなく既存ロットを入れ替えてから
      // syncItemAggregate で反映する（items.units 等との不整合を防ぐ）。
      // #693: バックアップは複数ロットを保持しうるので、1件だけでなく
      // item.lots 全件を作り直す。
      const { error: deleteLotsError } = await supabase
        .from("item_lots")
        .delete()
        .eq("item_id", existingId);
      if (deleteLotsError) throw new Error(deleteLotsError.message);

      for (const lot of item.lots) {
        await createLot(userId, existingId, lot);
      }

      const { error } = await supabase
        .from("items")
        .update({
          name: item.name,
          content_amount: item.content_amount,
          content_unit: item.content_unit,
          notes: item.notes ?? null,
          minimum_stock: item.minimum_stock ?? null,
          auto_reorder: item.auto_reorder ?? false,
          reorder_threshold: item.reorder_threshold ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId);
      if (error) throw new Error(error.message);

      await syncItemAggregate(existingId);
      updatedCount += 1;
      continue;
    }

    // "duplicate"（既存があっても新規として追加）または重複なし: 新規作成する。
    const { data: created, error: createError } = await supabase
      .from("items")
      .insert({
        user_id: userId,
        name: item.name,
        barcode: item.barcode ?? null,
        content_amount: item.content_amount,
        content_unit: item.content_unit,
        notes: item.notes ?? null,
        minimum_stock: item.minimum_stock ?? null,
        auto_reorder: item.auto_reorder ?? false,
        reorder_threshold: item.reorder_threshold ?? null,
      })
      .select("id")
      .single();
    if (createError) throw new Error(createError.message);

    const createdId = (created as { id: string }).id;
    // #693: バックアップが複数ロットを持つ場合、そのすべてを個別のロットとして復元する。
    for (const lot of item.lots) {
      await createLot(userId, createdId, lot);
    }
    await syncItemAggregate(createdId);

    // 同一インポート内で同じバーコードが複数回出てきた場合に備え、今作った
    // 行を以降の重複判定にも反映する。
    if (item.barcode) existingIdByBarcode.set(item.barcode, createdId);
    createdCount += 1;
  }

  return { createdCount, updatedCount, skippedCount };
};

export const useImportItems = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");

  return useMutation({
    mutationFn: importItems,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: LOTS_KEY }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
