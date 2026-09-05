import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";
import { AlreadyInStockBanner } from "@/components/molecules/AlreadyInStockBanner";
import { MultiTagSelect } from "@/components/molecules/MultiTagSelect";
import { QuickConsumeSheet } from "@/components/molecules/QuickConsumeSheet";
import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useConsumeItem } from "@/hooks/useConsumeItem";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { downloadExternalImageAsFile, uploadItemImage } from "@/hooks/useItemImage";
import { useConsumeLot, useItemLots } from "@/hooks/useItemLots";
import {
  countRecentExpiredWaste,
  findActiveItemByBarcode,
  REPEAT_WASTE_ALERT_THRESHOLD,
  useCreateItem,
  useItem,
} from "@/hooks/useItems";
import { useStorageLocations } from "@/hooks/useMasterData";
import { setItemTags, useCreateTag, useTags } from "@/hooks/useTags";
import { useUserSettings } from "@/hooks/useUserSettings";
import { clearItemFormDraft } from "@/lib/itemFormDraft";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import {
  isAlreadyInStock,
  type Item,
  type ItemFormValues,
  pickFifoConsumableLot,
  targetsExistingItem,
} from "@/types/item";

interface NewItemPageProps {
  cloneFrom?: string;
}

export const NewItemPage = ({ cloneFrom }: NewItemPageProps) => {
  const { t } = useTranslation("items");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createItem = useCreateItem();
  const { toast } = useToast();
  const pendingFileRef = useRef<File | null>(null);
  const pendingImageUrlRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingItem, setExistingItem] = useState<Item | null>(null);
  // #924: バーコードスキャンが在庫ありの既存アイテムに一致したときに表示する
  // クイック消費シート（QuickConsumeSheet）。existingItem とは独立に持つ:
  // シートを閉じて「新規登録として追加する」を選んだ後も existingItem（＝
  // AlreadyInStockBanner とスタック確認ダイアログ）はそのまま既存の登録フロー
  // 通りに動かし続けたいため。
  const [quickConsumeItem, setQuickConsumeItem] = useState<Item | null>(null);
  const [pendingValues, setPendingValues] = useState<ItemFormValues | null>(null);
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showStackDialog, setShowStackDialog] = useState(false);
  const stackDialogTitleId = useId();
  const stackDialogContainerRef = useDialogA11y<HTMLDivElement>({
    open: showStackDialog,
    onClose: () => setShowStackDialog(false),
  });

  const { data: cloneSource, isLoading: isCloneLoading } = useItem(cloneFrom ?? "");
  const { data: userSettings, isLoading: isSettingsLoading } = useUserSettings();
  const { data: locations = [] } = useStorageLocations();

  // #924: クイック消費シート用。対象ロットの選定はFIFO（purchase_date昇順）で
  // 行い（docs/specs/features/quick-consume.md）、実際の消費デクリメントは
  // 既存の consumeLot / consumeItem にそのまま委譲する。
  const { data: quickConsumeLots = [] } = useItemLots(quickConsumeItem?.id ?? "");
  const quickConsumeFifoLot = quickConsumeItem
    ? pickFifoConsumableLot(quickConsumeLots, quickConsumeItem.content_amount)
    : null;
  const consumeLot = useConsumeLot();
  const consumeItemDirect = useConsumeItem();
  const isQuickConsuming = consumeLot.isPending || consumeItemDirect.isPending;

  // #735: 直近90日以内に同一商品を期限切れ廃棄していれば、購入量の見直しを促す
  // トーストを表示する（バーコード一致 or 名前一致）。既存の在庫チェック等と
  // 独立に判定してよい軽量な通知のため、失敗を握りつぶして warn するだけに留める。
  const warnIfRepeatWaste = async (candidate: { name?: string; barcode?: string | null }) => {
    try {
      const count = await countRecentExpiredWaste(candidate);
      if (count >= REPEAT_WASTE_ALERT_THRESHOLD) {
        toast(t("repeatWasteWarning", { count }), "warning", { durationMs: 8000 });
      }
    } catch {
      // 非致命: 警告が出せないだけで、アイテム追加自体には影響させない
    }
  };

  const handleBarcodeScanned = async (barcode: string, source: "db" | "api" | null) => {
    void warnIfRepeatWaste({ barcode });
    if (source !== "db") {
      setExistingItem(null);
      setQuickConsumeItem(null);
      return;
    }
    const found = await findActiveItemByBarcode(barcode);
    // 使い切り済み（在庫なし）のアイテムまでバナー表示すると誤ってスタックを
    // 迷わせるため、実在庫がある場合のみ「すでに在庫あり」として扱う (#559)。
    const matched = found && isAlreadyInStock(found) ? found : null;
    setExistingItem(matched);
    // #924: 在庫ありの既存アイテムに一致した場合、新規登録フォームへ進む代わりに
    // クイック消費シートを提示する（docs/specs/features/quick-consume.md）。
    // 非一致時（matched=null）は既存の新規登録フローへそのままフォールバックする。
    setQuickConsumeItem(matched);
  };

  const handleNameBlur = (name: string) => {
    void warnIfRepeatWaste({ name });
  };

  // #924: 「1点使う」。ロットが1件以上あればFIFO先頭ロットを対象に既存の
  // consumeLot へ委譲し、ロットがまだ無い旧アイテムは既存の consumeItem の
  // フォールバック経路（items行を直接更新）へ委譲する。デクリメント自体の
  // アルゴリズムはどちらも再実装しない。
  const handleQuickConsumeOne = async () => {
    if (!quickConsumeItem) return;
    try {
      if (quickConsumeFifoLot) {
        await consumeLot.mutateAsync({
          lot: quickConsumeFifoLot,
          item: quickConsumeItem,
          deltaAmount: quickConsumeItem.content_amount,
        });
      } else {
        await consumeItemDirect.mutateAsync({
          item: quickConsumeItem,
          deltaAmount: quickConsumeItem.content_amount,
        });
      }
      toast(t("quickConsumeSuccess", { name: quickConsumeItem.name }), "success");
      setQuickConsumeItem(null);
      void navigate({ to: "/" });
    } catch {
      // Error toast is handled by useConsumeLot/useConsumeItem's onError
    }
  };

  // #924: 「一部使用」。数量入力は既存の消費画面（ConsumeForm相当のUI）をそのまま
  // 再利用するため、FIFO先頭ロットをプリセットして遷移するだけに留める。
  const handleQuickConsumePartial = () => {
    if (!quickConsumeItem) return;
    const itemId = quickConsumeItem.id;
    const lotId = quickConsumeFifoLot?.id;
    setQuickConsumeItem(null);
    void navigate({ to: "/items/$itemId/consume", params: { itemId }, search: { lotId } });
  };

  // #924: 「新規登録として追加する」の脱出リンク・シートを閉じる操作。いずれも
  // クイック消費シートを閉じるだけで、AlreadyInStockBanner + 既存の新規登録
  // フォームはそのまま従来通り操作できる状態を保つ（existingItem は変えない）。
  const handleQuickConsumeDismiss = () => {
    setQuickConsumeItem(null);
  };

  const existingItemLocationName = existingItem?.storage_location_id
    ? (locations.find((l) => l.id === existingItem.storage_location_id)?.name ?? null)
    : null;

  const submitItem = async (values: ItemFormValues, forceNew: boolean) => {
    setIsSubmitting(true);
    try {
      const item = await createItem.mutateAsync({ values, forceNew });
      const result = item as Item & { _stacked?: boolean; _revived?: boolean };
      // #650: スタック（既存アイテムへの在庫加算）・復活（ソフトデリート解除）の
      // いずれも既存アイテムが対象なので、選択した画像・タグで上書きしてはならない。
      const isExistingItem = targetsExistingItem(result);
      // #672: アイテム自体の作成に成功した時点で下書きの役目は終わり
      // （タグ・画像の付随処理が後で失敗しても、テキスト項目の下書きは不要）。
      if (!cloneFrom) clearItemFormDraft("new-item");

      // タグを保存（既存アイテムへのスタック/復活時は上書きしない）
      if (selectedTagIds.length > 0 && !isExistingItem) {
        try {
          await setItemTags(item.id, selectedTagIds);
        } catch {
          // タグ保存失敗は非致命。アイテム自体は作成済み。
        }
      }

      const pendingFile = pendingFileRef.current;
      const pendingImageUrl = pendingImageUrlRef.current;
      if ((pendingFile || pendingImageUrl) && item && !isExistingItem) {
        try {
          const file =
            pendingFile ??
            (pendingImageUrl ? await downloadExternalImageAsFile(pendingImageUrl) : null);
          if (file) await uploadItemImage({ itemId: item.id, file, queryClient: qc });
        } catch (err) {
          toast(
            err instanceof OfflineError ? t("common:offlineError") : t("imageUploadFailed"),
            err instanceof OfflineError ? "error" : "warning",
          );
          await qc.invalidateQueries({ queryKey: ["items"] });
          void navigate({ to: "/" });
          return;
        }
      }

      await qc.invalidateQueries({ queryKey: ["items"] });
      if (result._stacked) {
        toast(t("stackSuccess"), "success");
        void navigate({ to: "/items/$itemId", params: { itemId: item.id } });
      } else {
        toast(cloneFrom ? t("cloneSuccess") : t("createSuccess"), "success");
        void navigate({ to: "/" });
      }
    } catch {
      // error is handled by the mutation's onError
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (values: ItemFormValues) => {
    if (existingItem) {
      setPendingValues(values);
      setShowStackDialog(true);
      return;
    }
    void submitItem(values, false);
  };

  const handleDialogStack = () => {
    setShowStackDialog(false);
    if (pendingValues) void submitItem(pendingValues, false);
    setPendingValues(null);
  };

  const handleDialogCreateNew = () => {
    setShowStackDialog(false);
    if (pendingValues) void submitItem(pendingValues, true);
    setPendingValues(null);
  };

  const cloneDefaultValues: Partial<ItemFormValues> | undefined = cloneSource
    ? {
        name: cloneSource.name,
        barcode: cloneSource.barcode ?? "",
        category_id: cloneSource.category_id,
        item_type: cloneSource.item_type ?? null,
        storage_location_id: cloneSource.storage_location_id,
        content_amount: cloneSource.content_amount,
        content_unit: cloneSource.content_unit,
        units: 1,
        purchase_date: "",
        expiry_date: "",
        notes: "",
      }
    : userSettings?.default_unit
      ? { content_unit: userSettings.default_unit }
      : undefined;

  if ((cloneFrom && isCloneLoading) || (!cloneFrom && isSettingsLoading)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void navigate({ to: "/" })}
          aria-label={t("back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{cloneFrom ? t("cloneItem") : t("addItem")}</h1>
      </div>

      {existingItem && (
        <AlreadyInStockBanner
          units={existingItem.units}
          locationName={existingItemLocationName}
          expiryDate={existingItem.expiry_date}
          onAddNewLot={() => setExistingItem(null)}
          onViewExisting={() => {
            void navigate({ to: "/items/$itemId", params: { itemId: existingItem.id } });
          }}
        />
      )}

      {/* #924: バーコード即時消費 — 在庫ありの既存アイテムに一致した場合に、
          新規登録フォームへ進む代わりに表示するクイック消費シート
          （docs/specs/features/quick-consume.md）。QuickMemoSheet等と同様、
          マウント自体は維持したまま open で表示を切り替える。 */}
      <QuickConsumeSheet
        open={quickConsumeItem !== null}
        itemName={quickConsumeItem?.name ?? ""}
        units={quickConsumeItem?.units ?? 0}
        contentAmount={quickConsumeItem?.content_amount ?? 1}
        contentUnit={quickConsumeItem?.content_unit ?? ""}
        openedRemaining={quickConsumeItem?.opened_remaining ?? null}
        isConsuming={isQuickConsuming}
        onConsumeOne={() => {
          void handleQuickConsumeOne();
        }}
        onConsumePartial={handleQuickConsumePartial}
        onAddNewItem={handleQuickConsumeDismiss}
        onClose={handleQuickConsumeDismiss}
      />

      <ItemForm
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        onPendingFileChange={(file) => {
          pendingFileRef.current = file;
        }}
        onPendingImageUrlChange={(url) => {
          pendingImageUrlRef.current = url;
        }}
        onBarcodeScanned={(barcode, source) => {
          void handleBarcodeScanned(barcode, source);
        }}
        onNameBlur={handleNameBlur}
        submitLabel={existingItem ? t("stackSubmitLabel") : undefined}
        // #833: stacking onto an existing item reuses that item's content_amount to
        // interpret the new lot (tryStackToActiveItem never reads this form's value),
        // so editing it here would silently discard the input. Lock it like
        // EditItemPage does for items that already have lots (#742).
        disableContentAmount={!!existingItem}
        defaultValues={cloneDefaultValues}
        draftKey={cloneFrom ? undefined : "new-item"}
        enableLocationSuggestion
        extraFields={
          <div className="space-y-2">
            <Label>{t("tags")}</Label>
            <MultiTagSelect
              tags={tags}
              selectedIds={selectedTagIds}
              onChange={setSelectedTagIds}
              onCreate={(name) => createTag.mutateAsync({ name })}
              labels={{
                placeholder: t("tagPlaceholder"),
                addLabel: t("addTag"),
                removeLabel: t("common:delete"),
                empty: t("tagsEmpty"),
              }}
            />
          </div>
        }
      />

      {/* Stacking confirmation dialog */}
      {showStackDialog && existingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowStackDialog(false)}
        >
          <div
            ref={stackDialogContainerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={stackDialogTitleId}
            tabIndex={-1}
            className="w-full max-w-sm space-y-4 rounded-xl bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 id={stackDialogTitleId} className="text-base font-semibold">
                {t("stackDialogTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("stackDialogBody", { name: existingItem.name, units: existingItem.units })}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={handleDialogStack} className="w-full">
                {t("stackDialogStack")}
              </Button>
              <Button variant="outline" onClick={handleDialogCreateNew} className="w-full">
                {t("stackDialogCreateNew")}
              </Button>
              <Button variant="ghost" onClick={() => setShowStackDialog(false)} className="w-full">
                {t("common:cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
