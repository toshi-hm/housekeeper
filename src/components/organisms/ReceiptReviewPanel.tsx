import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ReceiptLineItemRow,
  type ReceiptRowStatus,
} from "@/components/molecules/ReceiptLineItemRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStoreNameSuggestions } from "@/hooks/useItemLots";
import { useCreateItem } from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import {
  createBlankDraftItem,
  draftItemToFormValues,
  isReceiptDraftValid,
  type ReceiptDraftItem,
} from "@/types/receipt";

interface BulkRegisterResult {
  succeeded: number;
  failed: number;
}

interface ReceiptReviewPanelProps {
  drafts: ReceiptDraftItem[];
  /** レシート全体から抽出した店舗名（品目ごとではない、#859）。 */
  storeName: string | null;
  onDraftsChange: (drafts: ReceiptDraftItem[]) => void;
  onStoreNameChange: (storeName: string | null) => void;
  onDone: (result: BulkRegisterResult) => void;
}

/** レビュー一覧全体。読み込み中/空状態、フッター固定の一括登録ボタンを持つ
 *  organism（receipt-scan.md「フロントエンド」節）。カテゴリ/保管場所の
 *  選択肢取得と一括登録（既存 `useCreateItem` へのループ委譲）を自分で持つ。 */
export const ReceiptReviewPanel = ({
  drafts,
  storeName,
  onDraftsChange,
  onStoreNameChange,
  onDone,
}: ReceiptReviewPanelProps) => {
  const { t } = useTranslation("receiptScan");
  const { t: ti } = useTranslation("items");
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: storeNameSuggestions = [] } = useStoreNameSuggestions();
  const createItem = useCreateItem();

  const [rowStatus, setRowStatus] = useState<Record<string, ReceiptRowStatus>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateDraft = (id: string, patch: Partial<ReceiptDraftItem>) => {
    onDraftsChange(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  // #923: 失敗行もここから削除できる（ReceiptLineItemRowのtrashボタンはpending/
  // failed両方で表示）。rowStatusも一緒に掃除し、同じidの行が手動追加で
  // 再利用されても古いstatusが残らないようにする。
  const removeDraft = (id: string) => {
    onDraftsChange(drafts.filter((d) => d.id !== id));
    setRowStatus((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const addBlankRow = () => {
    onDraftsChange([...drafts, createBlankDraftItem()]);
  };

  const includedCount = drafts.filter(isReceiptDraftValid).length;

  // 各行を順番に既存useCreateItemへ委譲する。1件の失敗が他行の登録を
  // ブロックしないベストエフォート方針（#694と同じ）。行ごとにインライン状態
  // (registering/success/failed)を反映し、失敗した行だけ再試行できるように
  // 状態は保持したまま返す（receipt-scan.md「フロントエンド」節）。
  const handleBulkRegister = async () => {
    const targets = drafts.filter(isReceiptDraftValid);
    if (targets.length === 0) return;

    setIsSubmitting(true);
    const succeededIds = new Set<string>();
    let failed = 0;
    for (const draft of targets) {
      setRowStatus((prev) => ({ ...prev, [draft.id]: "registering" }));
      try {
        await createItem.mutateAsync({
          values: draftItemToFormValues(draft, storeName),
          forceNew: true,
        });
        succeededIds.add(draft.id);
        setRowStatus((prev) => ({ ...prev, [draft.id]: "success" }));
      } catch {
        failed += 1;
        setRowStatus((prev) => ({ ...prev, [draft.id]: "failed" }));
      }
    }
    setIsSubmitting(false);

    if (failed === 0) {
      onDone({ succeeded: succeededIds.size, failed });
      return;
    }
    // 失敗行が残る場合は一覧に留まり、再試行できるようにする。成功済みの行は
    // 一覧から取り除いて二重登録を防ぐ。
    onDraftsChange(drafts.filter((d) => !succeededIds.has(d.id)));
  };

  // レシート全体から抽出した店舗名（品目ごとではない）を確認・編集するヘッダー欄。
  // #697 の店舗名入力欄（ItemForm）と同じサジェストパターンを流用する。
  const storeNameField = (
    <div className="space-y-1">
      <Label htmlFor="receipt-store-name">{ti("storeName")}</Label>
      <Input
        id="receipt-store-name"
        type="text"
        list="receipt-store-name-suggestions"
        value={storeName ?? ""}
        placeholder={ti("storeNamePlaceholder")}
        disabled={isSubmitting}
        onChange={(e) => onStoreNameChange(e.target.value === "" ? null : e.target.value)}
      />
      <datalist id="receipt-store-name-suggestions">
        {storeNameSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">{t("storeNameHint")}</p>
    </div>
  );

  if (drafts.length === 0) {
    return (
      <div className="space-y-4">
        {storeNameField}
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">{t("reviewEmpty")}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={addBlankRow}>
            <Plus className="mr-1 h-4 w-4" />
            {t("addRow")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {storeNameField}
      <div className="space-y-2">
        {drafts.map((draft) => (
          <ReceiptLineItemRow
            key={draft.id}
            draft={draft}
            categories={categories}
            locations={locations}
            status={rowStatus[draft.id] ?? "pending"}
            onChange={(patch) => updateDraft(draft.id, patch)}
            onRemove={() => removeDraft(draft.id)}
          />
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={addBlankRow} disabled={isSubmitting}>
        <Plus className="mr-1 h-4 w-4" />
        {t("addRow")}
      </Button>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          <Button
            className="w-full"
            disabled={includedCount === 0 || isSubmitting}
            onClick={() => void handleBulkRegister()}
          >
            {isSubmitting ? t("registering") : t("bulkRegister", { count: includedCount })}
          </Button>
        </div>
      </div>
    </div>
  );
};
