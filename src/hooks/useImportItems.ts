import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { LOTS_KEY, syncItemAggregate } from "@/hooks/useItemLots";
import type { ImportItemInput } from "@/lib/export";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
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

interface ImportBatchRow {
  item_id: string;
  action: "created" | "updated" | "skipped";
}

/**
 * `useImportItems` の実処理。単体テストのため素の関数として切り出している。
 *
 * #694: 以前はアイテムごとに複数回の Supabase 呼び出し（ロット削除 →
 * items insert/update → createLot）をクライアント側ループで実行しており、
 * 途中の1件が失敗すると前半だけがDBに反映された部分成功状態になり、しかも
 * バーコードを持たないアイテムは重複判定できないため再試行で二重作成されて
 * いた。バッチ全体を単一トランザクションの Postgres 関数
 * （`import_items_batch`）にまとめることで、失敗時は何も反映されない
 * （＝再試行が常に安全）ようにする。アイテム集約値の再計算
 * （syncItemAggregate）だけは他のミューテーションと同様に別ステップとして
 * 実行する（失敗しても在庫自体は正しく作成済みで、非致命的）。
 */
export const importItems = async ({
  items,
  duplicateStrategy,
}: ImportItemsInput): Promise<ImportItemsResult> => {
  requireOnline();

  const { data, error } = await supabase.rpc("import_items_batch", {
    p_items: items,
    p_duplicate_strategy: duplicateStrategy,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ImportBatchRow[];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    if (row.action === "created") createdCount += 1;
    else if (row.action === "updated") updatedCount += 1;
    else skippedCount += 1;
  }

  // items.units / expiry_date 等はロットからの集約値のため、バッチ本体の
  // トランザクションとは別に再計算する。1件の失敗が他のアイテムの結果に
  // 波及しないよう Promise.allSettled で並列に実行する（在庫自体はすでに
  // 正しくコミット済みなので、集約再計算の失敗は非致命的）。
  const affectedIds = rows.filter((row) => row.action !== "skipped").map((row) => row.item_id);
  await Promise.allSettled(affectedIds.map((id) => syncItemAggregate(id)));

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
