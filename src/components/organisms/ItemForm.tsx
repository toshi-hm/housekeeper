import { Barcode, Loader2, Search } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { VoiceInputButton } from "@/components/atoms/VoiceInputButton";
import { ImageUploader } from "@/components/molecules/ImageUploader";
import { ProductLookupResult } from "@/components/molecules/ProductLookupResult";
import { QuickAddSelect } from "@/components/molecules/QuickAddSelect";
import { BarcodeScanner } from "@/components/organisms/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ProductInfo, useBarcodeLookup } from "@/hooks/useBarcodeLookup";
import { useCreateCustomUnit, useCustomUnits, useDeleteCustomUnit } from "@/hooks/useCustomUnits";
import { useSignedItemImage } from "@/hooks/useItemImage";
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
import { useToast } from "@/lib/toast-context";
import { CONTENT_UNITS, type ItemFormValues } from "@/types/item";

interface ItemFormProps {
  defaultValues?: Partial<ItemFormValues>;
  onSubmit: (values: ItemFormValues) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  onPendingFileChange?: (file: File | null) => void;
  onPendingImageUrlChange?: (url: string | null) => void;
  /** Called after a barcode is scanned or manually looked up */
  onBarcodeScanned?: (barcode: string, source: "db" | "api" | null) => void;
  /** カテゴリ・保管場所の下に差し込む追加フィールド（タグ選択など） */
  extraFields?: ReactNode;
}

export const ItemForm = ({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  onPendingFileChange,
  onPendingImageUrlChange,
  onBarcodeScanned,
  extraFields,
}: ItemFormProps) => {
  const { t } = useTranslation("items");
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("settings");
  const { toast } = useToast();
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: customUnits = [] } = useCustomUnits();
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
    notes: defaultValues?.notes ?? "",
    image_path: defaultValues?.image_path ?? "",
    minimum_stock: defaultValues?.minimum_stock ?? null,
    unit_price: defaultValues?.unit_price ?? null,
  });
  const [unitsRaw, setUnitsRaw] = useState(String(defaultValues?.units ?? 1));
  const [contentAmountRaw, setContentAmountRaw] = useState(
    String(defaultValues?.content_amount ?? 1),
  );
  const [showScanner, setShowScanner] = useState(false);
  const [nameError, setNameError] = useState("");
  const [unitsError, setUnitsError] = useState("");
  const [contentAmountError, setContentAmountError] = useState("");
  const [minimumStockError, setMinimumStockError] = useState("");
  const [unitPriceError, setUnitPriceError] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [barcodeImageUrl, setBarcodeImageUrl] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<ProductInfo | null | undefined>(undefined);
  const [lookupSource, setLookupSource] = useState<"db" | "api" | null>(null);
  const speechInput = useSpeechInput((transcript) => {
    setValues((previous) => ({ ...previous, name: transcript }));
    setNameError("");
  });

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const { data: existingImageUrl } = useSignedItemImage(
    localPreviewUrl ? null : values.image_path || null,
  );

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
    set("storage_location_id", location.id);
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
      typeof values.unit_price === "number" &&
      (isNaN(values.unit_price) || values.unit_price < 0)
    ) {
      setUnitPriceError(t("unitPriceInvalid"));
      hasError = true;
    }

    if (hasError) return;

    onSubmit({
      ...values,
      units: parsedUnits,
      content_amount: parsedContentAmount,
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

      <form onSubmit={handleSubmit} className="space-y-4 pb-6">
        {/* Barcode */}
        <div className="space-y-2">
          <Label htmlFor="barcode">{t("barcode")}</Label>
          <div className="flex gap-2">
            <Input
              id="barcode"
              value={values.barcode ?? ""}
              onChange={(e) => set("barcode", e.target.value)}
              placeholder={t("barcodePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && values.barcode) {
                  e.preventDefault();
                  void handleBarcodeScan(values.barcode);
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
                placeholder={t("namePlaceholder")}
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
          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
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
            value={values.storage_location_id ?? ""}
            onChange={(value) => set("storage_location_id", value || null)}
            options={locations.map((l) => ({ value: l.id, label: l.name, icon: l.icon }))}
            placeholder={t("storageLocationPlaceholder")}
            onAdd={handleAddLocation}
            onDelete={handleDeleteLocation}
            addLabel={t("addStorageLocation")}
            confirmLabel={t("common:confirm")}
            cancelLabel={t("common:cancel")}
            addErrorMessage={t("addError")}
          />
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
            />
            <span className="text-sm text-muted-foreground">{t("unitsLabel")}</span>
          </div>
          {unitsError && <p className="text-sm text-destructive">{unitsError}</p>}
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
            />
            {contentAmountError && <p className="text-sm text-destructive">{contentAmountError}</p>}
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
            <Input
              id="expiry_date"
              type="date"
              value={values.expiry_date ?? ""}
              onChange={(e) => set("expiry_date", e.target.value)}
            />
          </div>
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
          <p className="text-xs text-muted-foreground">{t("minimumStockHelp")}</p>
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
          />
          {minimumStockError && <p className="text-sm text-destructive">{minimumStockError}</p>}
        </div>

        {/* Unit price */}
        <div className="space-y-2">
          <Label htmlFor="unit_price">{t("unitPrice")}</Label>
          <p className="text-xs text-muted-foreground">{t("unitPriceHelp")}</p>
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
            />
            <span className="text-sm text-muted-foreground">{t("unitPriceSuffix")}</span>
          </div>
          {unitPriceError && <p className="text-sm text-destructive">{unitPriceError}</p>}
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
