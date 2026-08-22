import { Barcode, Camera, Loader2, Search } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ExpiryTypeSelect } from "@/components/atoms/ExpiryTypeSelect";
import { VoiceInputButton } from "@/components/atoms/VoiceInputButton";
import { ImageUploader } from "@/components/molecules/ImageUploader";
import { LocationPinPicker } from "@/components/molecules/LocationPinPicker";
import { ProductLookupResult } from "@/components/molecules/ProductLookupResult";
import { QuickAddSelect } from "@/components/molecules/QuickAddSelect";
import { BarcodeScanner } from "@/components/organisms/BarcodeScanner";
import { ExpiryDateScanner } from "@/components/organisms/ExpiryDateScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ProductInfo, useBarcodeLookup } from "@/hooks/useBarcodeLookup";
import { useCreateCustomUnit, useCustomUnits, useDeleteCustomUnit } from "@/hooks/useCustomUnits";
import { useSignedItemImage } from "@/hooks/useItemImage";
import { useStoreNameSuggestions } from "@/hooks/useItemLots";
import { useSignedLocationPhoto } from "@/hooks/useLocationPhoto";
import {
  checkCategoryUsage,
  checkLocationUsage,
  useCategories,
  useCreateCategory,
  useCreateStorageLocation,
  useDeleteCategory,
  useDeleteStorageLocation,
  useStorageLocations,
} from "@/hooks/useMasterData";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useSuggestedLocation } from "@/hooks/useSuggestedLocation";
import { clearItemFormDraft, loadItemFormDraft, saveItemFormDraft } from "@/lib/itemFormDraft";
import { useToast } from "@/lib/toast-context";
import { CONTENT_UNITS, type ItemFormValues } from "@/types/item";

const DRAFT_SAVE_DEBOUNCE_MS = 600;

interface ItemFormProps {
  defaultValues?: Partial<ItemFormValues>;
  onSubmit: (values: ItemFormValues) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  onPendingFileChange?: (file: File | null) => void;
  onPendingImageUrlChange?: (url: string | null) => void;
  /** Called after a barcode is scanned or manually looked up */
  onBarcodeScanned?: (barcode: string, source: "db" | "api" | null) => void;
  /** Called when the name field loses focus with a non-empty value (#735) */
  onNameBlur?: (name: string) => void;
  /** カテゴリ・保管場所の下に差し込む追加フィールド（タグ選択など） */
  extraFields?: ReactNode;
  /**
   * #742: ロットが既に存在するアイテムを編集する場合に true を渡すと、
   * content_amount（内包量）の変更を禁止する。ロットは購入時点の
   * content_amount を基準に残量を計算するため、編集後に値を変えると
   * 既存ロットの解釈が変わり実在庫とズレてしまうため。
   */
  disableContentAmount?: boolean;
  /**
   * #672: 指定すると入力中の値をlocalStorageに下書き保存し、次回マウント時に
   * 復元/破棄を選べるようにする（ネットワーク失敗・タブ誤操作等からの救済、
   * PLANS.md §7.4）。省略時は下書き機能自体が無効（例: 既存アイテムの編集画面は
   * defaultValuesに実データが入っているため対象外）。
   */
  draftKey?: string;
  /**
   * #814: バーコード一致 or 商品名一致で過去に登録した同一商品があれば、
   * その直近の保管場所を保管場所セレクトに事前選択する（「再登録」の手間削減）。
   * 既存アイテムの編集画面では実データが既にあるため対象外、省略時はfalse。
   */
  enableLocationSuggestion?: boolean;
}

export const ItemForm = ({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  onPendingFileChange,
  onPendingImageUrlChange,
  onBarcodeScanned,
  onNameBlur,
  extraFields,
  disableContentAmount = false,
  draftKey,
  enableLocationSuggestion = false,
}: ItemFormProps) => {
  const { t } = useTranslation("items");
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("settings");
  const { toast } = useToast();
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: customUnits = [] } = useCustomUnits();
  const { data: storeNameSuggestions = [] } = useStoreNameSuggestions();
  const { lookup, isLoading: isLookingUp, error: lookupError } = useBarcodeLookup();
  const { mutateAsync: addCategory } = useCreateCategory();
  const { mutateAsync: addLocation } = useCreateStorageLocation();
  const { mutateAsync: addCustomUnit } = useCreateCustomUnit();
  const { mutateAsync: deleteCategoryMutate } = useDeleteCategory();
  const { mutateAsync: deleteLocationMutate } = useDeleteStorageLocation();
  const { mutateAsync: deleteCustomUnitMutate } = useDeleteCustomUnit();

  const [values, setValues] = useState<ItemFormValues>({
    name: defaultValues?.name ?? "",
    barcode: defaultValues?.barcode ?? "",
    category_id: defaultValues?.category_id ?? null,
    storage_location_id: defaultValues?.storage_location_id ?? null,
    units: defaultValues?.units ?? 1,
    content_amount: defaultValues?.content_amount ?? 1,
    content_unit: defaultValues?.content_unit ?? t("defaultContentUnit"),
    opened_remaining: defaultValues?.opened_remaining ?? null,
    purchase_date: defaultValues?.purchase_date ?? "",
    expiry_date: defaultValues?.expiry_date ?? "",
    expiry_type: defaultValues?.expiry_type ?? null,
    notes: defaultValues?.notes ?? "",
    image_path: defaultValues?.image_path ?? "",
    minimum_stock: defaultValues?.minimum_stock ?? null,
    days_use_after_opening: defaultValues?.days_use_after_opening ?? null,
    unit_price: defaultValues?.unit_price ?? null,
    store_name: defaultValues?.store_name ?? null,
    auto_reorder: defaultValues?.auto_reorder ?? false,
    reorder_threshold: defaultValues?.reorder_threshold ?? null,
    reorder_lead_days: defaultValues?.reorder_lead_days ?? null,
    pin_x: defaultValues?.pin_x ?? null,
    pin_y: defaultValues?.pin_y ?? null,
  });
  const [unitsRaw, setUnitsRaw] = useState(String(defaultValues?.units ?? 1));
  const [contentAmountRaw, setContentAmountRaw] = useState(
    String(defaultValues?.content_amount ?? 1),
  );
  const [showScanner, setShowScanner] = useState(false);
  const [showExpiryScanner, setShowExpiryScanner] = useState(false);
  const [nameError, setNameError] = useState("");
  const [unitsError, setUnitsError] = useState("");
  const [contentAmountError, setContentAmountError] = useState("");
  const [minimumStockError, setMinimumStockError] = useState("");
  const [daysUseAfterOpeningError, setDaysUseAfterOpeningError] = useState("");
  const [unitPriceError, setUnitPriceError] = useState("");
  const [reorderThresholdError, setReorderThresholdError] = useState("");
  const [reorderLeadDaysError, setReorderLeadDaysError] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [barcodeImageUrl, setBarcodeImageUrl] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<ProductInfo | null | undefined>(undefined);
  const [lookupSource, setLookupSource] = useState<"db" | "api" | null>(null);
  // #672: マウント時に既存の下書きがあれば復元/破棄を選ばせる。ユーザーが選ぶまでは
  // 自動保存を止めておく（さもないと未決の間に空の初期値で上書きしてしまう）。
  const [pendingDraft, setPendingDraft] = useState(() =>
    draftKey ? loadItemFormDraft(draftKey) : null,
  );
  const speechInput = useSpeechInput((transcript) => {
    setValues((previous) => ({ ...previous, name: transcript }));
    setNameError("");
  });

  useEffect(() => {
    if (!draftKey || pendingDraft) return;
    const timer = setTimeout(() => {
      saveItemFormDraft(draftKey, { values, unitsRaw, contentAmountRaw });
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftKey, pendingDraft, values, unitsRaw, contentAmountRaw]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setValues(pendingDraft.payload.values);
    setUnitsRaw(pendingDraft.payload.unitsRaw);
    setContentAmountRaw(pendingDraft.payload.contentAmountRaw);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    if (draftKey) clearItemFormDraft(draftKey);
    setPendingDraft(null);
  };

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  // #814: バーコード一致 or 商品名一致で見つかった過去の保管場所を、ユーザーが
  // まだ何も選んでいない間だけ保管場所セレクトの実効値として使う（setState を
  // effect 内から呼ばず、`values.storage_location_id` が空の間だけ描画・送信時に
  // フォールバックとして参照する派生値にする）。ユーザーが手動で保管場所を変更
  // したら (locationSuggestionDismissed) それ以降は提案を使わない。
  const [barcodeForSuggestion, setBarcodeForSuggestion] = useState<string | null>(null);
  const [nameForSuggestion, setNameForSuggestion] = useState<string | null>(null);
  const [locationSuggestionDismissed, setLocationSuggestionDismissed] = useState(false);
  const { data: suggestedLocationId } = useSuggestedLocation(
    { barcode: barcodeForSuggestion, name: barcodeForSuggestion ? null : nameForSuggestion },
    enableLocationSuggestion && !locationSuggestionDismissed && !values.storage_location_id,
  );
  const isLocationSuggested =
    enableLocationSuggestion &&
    !locationSuggestionDismissed &&
    !values.storage_location_id &&
    !!suggestedLocationId;
  const effectiveStorageLocationId = isLocationSuggested
    ? (suggestedLocationId ?? null)
    : values.storage_location_id;

  const { data: existingImageUrl } = useSignedItemImage(
    localPreviewUrl ? null : values.image_path || null,
  );

  const selectedLocation = locations.find((l) => l.id === effectiveStorageLocationId);
  const { data: selectedLocationPhotoUrl } = useSignedLocationPhoto(selectedLocation?.photo_path);

  const set = <K extends keyof ItemFormValues>(field: K, value: ItemFormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (field === "name") setNameError("");
    if (field === "barcode") {
      setLookupResult(undefined);
      setLookupSource(null);
      if (!localPreviewUrl) {
        setBarcodeImageUrl(null);
        onPendingImageUrlChange?.(null);
      }
    }
  };

  const handleBarcodeScan = async (barcode: string) => {
    setShowScanner(false);
    set("barcode", barcode);
    setBarcodeForSuggestion(barcode);
    setLookupResult(undefined);
    setLookupSource(null);
    if (navigator.vibrate) navigator.vibrate(100);
    try {
      const result = await lookup(barcode);
      setLookupResult(result.product);
      setLookupSource(result.source);
      if (result.product?.name) set("name", result.product.name);
      if (result.product?.image_url && !localPreviewUrl) {
        setBarcodeImageUrl(result.product.image_url);
        // DB ヒット時は既にStorage済みの画像なので再アップロード不要。プレビュー表示のみ。
        if (result.source !== "db") {
          onPendingImageUrlChange?.(result.product.image_url);
        }
      }
      onBarcodeScanned?.(barcode, result.source);
    } catch {
      setLookupResult(null);
      toast(t("barcodeLookupError"), "error");
      onBarcodeScanned?.(barcode, null);
    }
  };

  const handleAddCategory = async (name: string) => {
    const category = await addCategory({ name });
    set("category_id", category.id);
  };

  const handleAddLocation = async (name: string) => {
    const location = await addLocation({ name });
    set("pin_x", null);
    set("pin_y", null);
    set("storage_location_id", location.id);
    setLocationSuggestionDismissed(true);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const count = await checkCategoryUsage(categoryId);
    if (count > 0) throw new Error(ts("categoryInUse"));
    await deleteCategoryMutate(categoryId);
  };

  const handleDeleteLocation = async (locationId: string) => {
    const count = await checkLocationUsage(locationId);
    if (count > 0) throw new Error(ts("locationInUse"));
    await deleteLocationMutate(locationId);
  };

  // content_unit はプリセット(CONTENT_UNITS)とカスタム単位(custom_units)のマージ。
  // 値はカテゴリ/保管場所と違いid参照ではなく単位名そのもの（items.content_unitがtext列）
  // なので、既にプリセットと同名のカスタム単位があっても重複表示しないようフィルタする。
  const customUnitOptions = customUnits.filter(
    (u) => !(CONTENT_UNITS as readonly string[]).includes(u.name),
  );
  const configuredContentUnitOptions = [
    ...CONTENT_UNITS.map((u) => ({ value: u, label: u })),
    ...customUnitOptions.map((u) => ({ value: u.name, label: u.name })),
  ];
  // A deleted custom-unit row must not make an existing copied text value look
  // empty while editing an item. Keep the current value visible for this form.
  const contentUnitOptions = configuredContentUnitOptions.some(
    (option) => option.value === values.content_unit,
  )
    ? configuredContentUnitOptions
    : [...configuredContentUnitOptions, { value: values.content_unit, label: values.content_unit }];

  const handleAddCustomUnit = async (name: string) => {
    const unit = await addCustomUnit(name);
    set("content_unit", unit.name);
  };

  const handleDeleteCustomUnit = async (unitName: string) => {
    if ((CONTENT_UNITS as readonly string[]).includes(unitName)) {
      throw new Error(t("presetUnitCannotDelete"));
    }
    const unit = customUnits.find((u) => u.name === unitName);
    if (!unit) return;
    await deleteCustomUnitMutate(unit.id);
  };

  const handleImageFile = (file: File) => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const url = URL.createObjectURL(file);
    setLocalPreviewUrl(url);
    setBarcodeImageUrl(null);
    onPendingImageUrlChange?.(null);
    onPendingFileChange?.(file);
  };

  const handleImageDelete = () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    setBarcodeImageUrl(null);
    set("image_path", "");
    onPendingFileChange?.(null);
    onPendingImageUrlChange?.(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (!values.name.trim()) {
      setNameError(t("common:required"));
      hasError = true;
    }

    const parsedUnits = parseInt(unitsRaw, 10);
    if (unitsRaw.trim() === "" || isNaN(parsedUnits)) {
      setUnitsError(t("unitsRequired"));
      hasError = true;
    } else if (parsedUnits <= 0) {
      setUnitsError(t("unitsPositive"));
      hasError = true;
    }

    const parsedContentAmount = Math.round(parseFloat(contentAmountRaw) * 100) / 100;
    if (contentAmountRaw.trim() === "" || isNaN(parsedContentAmount) || parsedContentAmount <= 0) {
      setContentAmountError(t("contentAmountRequired"));
      hasError = true;
    }

    if (
      typeof values.minimum_stock === "number" &&
      (isNaN(values.minimum_stock) || values.minimum_stock < 0)
    ) {
      setMinimumStockError(t("minimumStockInvalid"));
      hasError = true;
    }

    if (
      typeof values.days_use_after_opening === "number" &&
      (isNaN(values.days_use_after_opening) || values.days_use_after_opening < 1)
    ) {
      setDaysUseAfterOpeningError(t("daysUseAfterOpeningInvalid"));
      hasError = true;
    }

    if (
      typeof values.unit_price === "number" &&
      (isNaN(values.unit_price) || values.unit_price < 0)
    ) {
      setUnitPriceError(t("unitPriceInvalid"));
      hasError = true;
    }

    if (
      typeof values.reorder_threshold === "number" &&
      (isNaN(values.reorder_threshold) || values.reorder_threshold < 0)
    ) {
      setReorderThresholdError(t("reorderThresholdInvalid"));
      hasError = true;
    }

    if (
      typeof values.reorder_lead_days === "number" &&
      (isNaN(values.reorder_lead_days) || values.reorder_lead_days < 0)
    ) {
      setReorderLeadDaysError(t("reorderLeadDaysInvalid"));
      hasError = true;
    }

    if (hasError) return;

    onSubmit({
      ...values,
      units: parsedUnits,
      content_amount: parsedContentAmount,
      storage_location_id: effectiveStorageLocationId,
      barcode: values.barcode || undefined,
      purchase_date: values.purchase_date || undefined,
      expiry_date: values.expiry_date || undefined,
      notes: values.notes || undefined,
      image_path: values.image_path || undefined,
    });
  };

  return (
    <>
      {showScanner && (
        <BarcodeScanner
          onScan={(barcode) => {
            void handleBarcodeScan(barcode);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showExpiryScanner && (
        <ExpiryDateScanner
          onConfirm={(isoDate) => {
            set("expiry_date", isoDate);
            setShowExpiryScanner(false);
          }}
          onClose={() => setShowExpiryScanner(false)}
        />
      )}

      {pendingDraft && (
        <div
          role="status"
          className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <span>{t("draftRestorePrompt")}</span>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={discardDraft}>
              {t("draftDiscard")}
            </Button>
            <Button type="button" size="sm" onClick={restoreDraft}>
              {t("draftRestore")}
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 pb-6">
        {/* Barcode */}
        <div className="space-y-2">
          <Label htmlFor="barcode">{t("barcode")}</Label>
          <div className="flex gap-2">
            <Input
              id="barcode"
              value={values.barcode ?? ""}
              onChange={(e) => {
                set("barcode", e.target.value);
                // #814: 手動編集でバーコード値が確定スキャン時点と食い違ったら、古い
                // バーコードに紐づいた保管場所サジェストの照会対象をクリアする。でないと
                // バーコードを消して商品名だけで入力し直しても、名前ベースのフォール
                // バックが一生ブロックされたままになる。
                setBarcodeForSuggestion(null);
              }}
              placeholder={t("barcodePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (values.barcode) void handleBarcodeScan(values.barcode);
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                if (values.barcode) void handleBarcodeScan(values.barcode);
              }}
              disabled={isLookingUp || !values.barcode}
              title={t("searchBarcode")}
            >
              {isLookingUp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowScanner(true)}
              disabled={isLookingUp}
              title={t("scanBarcode")}
            >
              <Barcode className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Product lookup result */}
        <ProductLookupResult
          isLoading={isLookingUp}
          product={lookupResult}
          errorType={lookupResult === null ? lookupError : null}
        />
        {lookupSource === "db" && lookupResult?.name && (
          <p className="text-xs text-muted-foreground">{t("lookupFromHistory")}</p>
        )}

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")} *</Label>
          <div className="flex items-center gap-2">
            {lookupResult?.image_url && (
              <div className="w-1/4 shrink-0">
                <img
                  src={lookupResult.image_url}
                  alt={lookupResult.name}
                  className="h-10 w-full rounded border object-contain"
                />
              </div>
            )}
            <div className="flex flex-1 min-w-0 gap-2">
              <Input
                id="name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={(e) => {
                  const trimmed = e.target.value.trim();
                  if (trimmed) {
                    onNameBlur?.(e.target.value);
                    setNameForSuggestion(trimmed);
                  }
                }}
                placeholder={t("namePlaceholder")}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "name-error" : undefined}
              />
              <VoiceInputButton
                isSupported={speechInput.isSupported}
                isListening={speechInput.isListening}
                onStart={speechInput.start}
                label={tc("voiceInput")}
                listeningLabel={tc("voiceInputListening")}
              />
            </div>
          </div>
          {nameError && (
            <p id="name-error" className="text-sm text-destructive">
              {nameError}
            </p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category_id">{t("category")}</Label>
          <QuickAddSelect
            id="category_id"
            value={values.category_id ?? ""}
            onChange={(value) => set("category_id", value || null)}
            options={categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon }))}
            placeholder={t("categoryPlaceholder")}
            onAdd={handleAddCategory}
            onDelete={handleDeleteCategory}
            addLabel={t("addCategory")}
            confirmLabel={t("common:confirm")}
            cancelLabel={t("common:cancel")}
            addErrorMessage={t("addError")}
          />
        </div>

        {/* Storage Location */}
        <div className="space-y-2">
          <Label htmlFor="storage_location_id">{t("storageLocation")}</Label>
          <QuickAddSelect
            id="storage_location_id"
            value={effectiveStorageLocationId ?? ""}
            onChange={(value) => {
              if (value !== effectiveStorageLocationId) {
                set("pin_x", null);
                set("pin_y", null);
              }
              set("storage_location_id", value || null);
              setLocationSuggestionDismissed(true);
            }}
            options={locations.map((l) => ({ value: l.id, label: l.name, icon: l.icon }))}
            placeholder={t("storageLocationPlaceholder")}
            onAdd={handleAddLocation}
            onDelete={handleDeleteLocation}
            addLabel={t("addStorageLocation")}
            confirmLabel={t("common:confirm")}
            cancelLabel={t("common:cancel")}
            addErrorMessage={t("addError")}
          />
          {isLocationSuggested && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t("suggestedLocationHint")}
            </p>
          )}
          {selectedLocationPhotoUrl && (
            <LocationPinPicker
              photoUrl={selectedLocationPhotoUrl}
              value={
                values.pin_x !== null &&
                values.pin_x !== undefined &&
                values.pin_y !== null &&
                values.pin_y !== undefined
                  ? { x: values.pin_x, y: values.pin_y }
                  : null
              }
              onChange={(pos) => {
                set("pin_x", pos?.x ?? null);
                set("pin_y", pos?.y ?? null);
              }}
            />
          )}
        </div>

        {extraFields}

        {/* Quantity (units × content_amount content_unit) */}
        <div className="space-y-2">
          <Label htmlFor="units">{t("units")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="units"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={unitsRaw}
              onChange={(e) => {
                const raw = e.target.value;
                if (!/^\d*$/.test(raw)) return;
                setUnitsRaw(raw);
                const parsed = parseInt(raw, 10);
                if (raw !== "" && !isNaN(parsed) && parsed <= 0) {
                  setUnitsError(t("unitsPositive"));
                } else {
                  setUnitsError("");
                }
                if (raw !== "") set("units", parsed);
              }}
              className="w-24"
              aria-invalid={!!unitsError}
              aria-describedby={unitsError ? "units-error" : undefined}
            />
            <span className="text-sm text-muted-foreground">{t("unitsLabel")}</span>
          </div>
          {unitsError && (
            <p id="units-error" className="text-sm text-destructive">
              {unitsError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="content_amount">{t("contentAmount")}</Label>
            <Input
              id="content_amount"
              type="text"
              inputMode="decimal"
              value={contentAmountRaw}
              onChange={(e) => {
                const raw = e.target.value;
                if (!/^\d*\.?\d*$/.test(raw)) return;
                setContentAmountRaw(raw);
                setContentAmountError("");
                const num = parseFloat(raw);
                if (!isNaN(num) && num > 0) set("content_amount", num);
              }}
              disabled={disableContentAmount}
              aria-invalid={!!contentAmountError}
              aria-describedby={
                contentAmountError
                  ? "content-amount-error"
                  : disableContentAmount
                    ? "content-amount-locked-hint"
                    : undefined
              }
            />
            {contentAmountError && (
              <p id="content-amount-error" className="text-sm text-destructive">
                {contentAmountError}
              </p>
            )}
            {!contentAmountError && disableContentAmount && (
              <p id="content-amount-locked-hint" className="text-sm text-muted-foreground">
                {t("contentAmountLockedHint")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="content_unit">{t("contentUnit")}</Label>
            <QuickAddSelect
              id="content_unit"
              value={values.content_unit}
              onChange={(value) => set("content_unit", value)}
              options={contentUnitOptions}
              allowClear={false}
              clearSelectionOnDelete={false}
              onAdd={handleAddCustomUnit}
              onDelete={handleDeleteCustomUnit}
              addLabel={t("addUnit")}
              confirmLabel={t("common:confirm")}
              cancelLabel={t("common:cancel")}
              addErrorMessage={t("addError")}
            />
          </div>
        </div>

        {/* Purchase / Expiry dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="purchase_date">{t("purchaseDate")}</Label>
            <Input
              id="purchase_date"
              type="date"
              value={values.purchase_date ?? ""}
              onChange={(e) => set("purchase_date", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiry_date">{t("expiryDate")}</Label>
            <div className="flex gap-2">
              <Input
                id="expiry_date"
                type="date"
                value={values.expiry_date ?? ""}
                onChange={(e) => set("expiry_date", e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowExpiryScanner(true)}
                title={t("expiryScanButtonTitle")}
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Expiry type: best-before (quality) vs use-by (safety), #714 */}
        <div className="space-y-2">
          <Label>{t("expiryType")}</Label>
          <p id="expiry-type-help" className="text-xs text-muted-foreground">
            {t("expiryTypeHelp")}
          </p>
          <ExpiryTypeSelect
            value={values.expiry_type ?? null}
            onChange={(value) => set("expiry_type", value)}
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Textarea
            id="notes"
            value={values.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder={t("notesPlaceholder")}
            rows={3}
          />
        </div>

        {/* Minimum stock */}
        <div className="space-y-2">
          <Label htmlFor="minimum_stock">{t("minimumStock")}</Label>
          <p id="minimum-stock-help" className="text-xs text-muted-foreground">
            {t("minimumStockHelp")}
          </p>
          <Input
            id="minimum_stock"
            type="number"
            min={0}
            className="w-28"
            value={values.minimum_stock ?? ""}
            placeholder="—"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                set("minimum_stock", null);
                setMinimumStockError("");
                return;
              }
              const parsed = parseInt(v, 10);
              set("minimum_stock", isNaN(parsed) ? null : parsed);
              setMinimumStockError(!isNaN(parsed) && parsed < 0 ? t("minimumStockInvalid") : "");
            }}
            aria-invalid={!!minimumStockError}
            aria-describedby={
              minimumStockError ? "minimum-stock-help minimum-stock-error" : "minimum-stock-help"
            }
          />
          {minimumStockError && (
            <p id="minimum-stock-error" className="text-sm text-destructive">
              {minimumStockError}
            </p>
          )}
        </div>

        {/* Days to use after opening (#752) */}
        <div className="space-y-2">
          <Label htmlFor="days_use_after_opening">{t("daysUseAfterOpening")}</Label>
          <p id="days-use-after-opening-help" className="text-xs text-muted-foreground">
            {t("daysUseAfterOpeningHelp")}
          </p>
          <Input
            id="days_use_after_opening"
            type="number"
            min={1}
            className="w-28"
            value={values.days_use_after_opening ?? ""}
            placeholder="—"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                set("days_use_after_opening", null);
                setDaysUseAfterOpeningError("");
                return;
              }
              const parsed = parseInt(v, 10);
              set("days_use_after_opening", isNaN(parsed) ? null : parsed);
              setDaysUseAfterOpeningError(
                !isNaN(parsed) && parsed < 1 ? t("daysUseAfterOpeningInvalid") : "",
              );
            }}
            aria-invalid={!!daysUseAfterOpeningError}
            aria-describedby={
              daysUseAfterOpeningError
                ? "days-use-after-opening-help days-use-after-opening-error"
                : "days-use-after-opening-help"
            }
          />
          {daysUseAfterOpeningError && (
            <p id="days-use-after-opening-error" className="text-sm text-destructive">
              {daysUseAfterOpeningError}
            </p>
          )}
        </div>

        {/* Unit price */}
        <div className="space-y-2">
          <Label htmlFor="unit_price">{t("unitPrice")}</Label>
          <p id="unit-price-help" className="text-xs text-muted-foreground">
            {t("unitPriceHelp")}
          </p>
          <div className="flex items-center gap-2">
            <Input
              id="unit_price"
              type="number"
              min={0}
              step={1}
              className="w-28"
              value={values.unit_price ?? ""}
              placeholder="—"
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  set("unit_price", null);
                  setUnitPriceError("");
                  return;
                }
                const parsed = parseInt(v, 10);
                set("unit_price", isNaN(parsed) ? null : parsed);
                setUnitPriceError(!isNaN(parsed) && parsed < 0 ? t("unitPriceInvalid") : "");
              }}
              aria-invalid={!!unitPriceError}
              aria-describedby={
                unitPriceError ? "unit-price-help unit-price-error" : "unit-price-help"
              }
            />
            <span className="text-sm text-muted-foreground">{t("unitPriceSuffix")}</span>
          </div>
          {unitPriceError && (
            <p id="unit-price-error" className="text-sm text-destructive">
              {unitPriceError}
            </p>
          )}
        </div>

        {/* Store name */}
        <div className="space-y-2">
          <Label htmlFor="store_name">{t("storeName")}</Label>
          <Input
            id="store_name"
            type="text"
            list="store-name-suggestions"
            value={values.store_name ?? ""}
            placeholder={t("storeNamePlaceholder")}
            onChange={(e) => set("store_name", e.target.value === "" ? null : e.target.value)}
          />
          <datalist id="store-name-suggestions">
            {storeNameSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        {/* Auto reorder */}
        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.auto_reorder}
              onChange={(e) => {
                set("auto_reorder", e.target.checked);
                if (!e.target.checked) setReorderThresholdError("");
              }}
              className="rounded"
            />
            {t("autoReorder")}
          </label>
          <p className="text-xs text-muted-foreground">{t("autoReorderHelp")}</p>
          {values.auto_reorder && (
            <div className="space-y-1 pl-6">
              <Label htmlFor="reorder_threshold">{t("reorderThreshold")}</Label>
              <p id="reorder-threshold-help" className="text-xs text-muted-foreground">
                {t("reorderThresholdHelp")}
              </p>
              <Input
                id="reorder_threshold"
                type="number"
                min={0}
                className="w-28"
                value={values.reorder_threshold ?? ""}
                placeholder="0"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") {
                    set("reorder_threshold", null);
                    setReorderThresholdError("");
                    return;
                  }
                  const parsed = parseInt(v, 10);
                  set("reorder_threshold", isNaN(parsed) ? null : parsed);
                  setReorderThresholdError(
                    !isNaN(parsed) && parsed < 0 ? t("reorderThresholdInvalid") : "",
                  );
                }}
                aria-invalid={!!reorderThresholdError}
                aria-describedby={
                  reorderThresholdError
                    ? "reorder-threshold-help reorder-threshold-error"
                    : "reorder-threshold-help"
                }
              />
              {reorderThresholdError && (
                <p id="reorder-threshold-error" className="text-sm text-destructive">
                  {reorderThresholdError}
                </p>
              )}

              <Label htmlFor="reorder_lead_days">{t("reorderLeadDays")}</Label>
              <p id="reorder-lead-days-help" className="text-xs text-muted-foreground">
                {t("reorderLeadDaysHelp")}
              </p>
              <Input
                id="reorder_lead_days"
                type="number"
                min={0}
                className="w-28"
                value={values.reorder_lead_days ?? ""}
                placeholder={t("reorderLeadDaysPlaceholder")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") {
                    set("reorder_lead_days", null);
                    setReorderLeadDaysError("");
                    return;
                  }
                  const parsed = parseInt(v, 10);
                  set("reorder_lead_days", isNaN(parsed) ? null : parsed);
                  setReorderLeadDaysError(
                    !isNaN(parsed) && parsed < 0 ? t("reorderLeadDaysInvalid") : "",
                  );
                }}
                aria-invalid={!!reorderLeadDaysError}
                aria-describedby={
                  reorderLeadDaysError
                    ? "reorder-lead-days-help reorder-lead-days-error"
                    : "reorder-lead-days-help"
                }
              />
              {reorderLeadDaysError && (
                <p id="reorder-lead-days-error" className="text-sm text-destructive">
                  {reorderLeadDaysError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Image */}
        <div className="space-y-2">
          <Label>{t("image")}</Label>
          <ImageUploader
            previewUrl={localPreviewUrl ?? barcodeImageUrl ?? existingImageUrl}
            onFile={handleImageFile}
            onDelete={
              values.image_path || localPreviewUrl || barcodeImageUrl
                ? handleImageDelete
                : undefined
            }
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel ?? t("common:save")}
        </Button>
      </form>
    </>
  );
};
