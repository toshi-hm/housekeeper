import { Barcode, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { ImageUploader } from "@/components/molecules/ImageUploader";
import { ProductLookupResult } from "@/components/molecules/ProductLookupResult";
import { QuickAddSelect } from "@/components/molecules/QuickAddSelect";
import { BarcodeScanner } from "@/components/organisms/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type ProductInfo, useBarcodeLookup } from "@/hooks/useBarcodeLookup";
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
import { CONTENT_UNITS, type ItemFormValues } from "@/types/item";

interface ItemFormProps {
  defaultValues?: Partial<ItemFormValues>;
  onSubmit: (values: ItemFormValues) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  onPendingFileChange?: (file: File | null) => void;
}

export const ItemForm = ({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  onPendingFileChange,
}: ItemFormProps) => {
  const { t } = useTranslation("items");
  const { t: ts } = useTranslation("settings");
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { lookup, isLoading: isLookingUp, error: lookupError } = useBarcodeLookup();
  const { mutateAsync: addCategory } = useCreateCategory();
  const { mutateAsync: addLocation } = useCreateStorageLocation();
  const { mutateAsync: deleteCategoryMutate } = useDeleteCategory();
  const { mutateAsync: deleteLocationMutate } = useDeleteStorageLocation();

  const [values, setValues] = useState<ItemFormValues>({
    name: defaultValues?.name ?? "",
    barcode: defaultValues?.barcode ?? "",
    category_id: defaultValues?.category_id ?? null,
    storage_location_id: defaultValues?.storage_location_id ?? null,
    units: defaultValues?.units ?? 1,
    content_amount: defaultValues?.content_amount ?? 1,
    content_unit: defaultValues?.content_unit ?? "個",
    opened_remaining: defaultValues?.opened_remaining ?? null,
    purchase_date: defaultValues?.purchase_date ?? "",
    expiry_date: defaultValues?.expiry_date ?? "",
    notes: defaultValues?.notes ?? "",
    image_path: defaultValues?.image_path ?? "",
  });
  const [unitsRaw, setUnitsRaw] = useState(String(defaultValues?.units ?? 1));
  const [contentAmountRaw, setContentAmountRaw] = useState(
    String(defaultValues?.content_amount ?? 1),
  );
  const [showScanner, setShowScanner] = useState(false);
  const [nameError, setNameError] = useState("");
  const [unitsError, setUnitsError] = useState("");
  const [contentAmountError, setContentAmountError] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<ProductInfo | null | undefined>(undefined);

  const { data: existingImageUrl } = useSignedItemImage(
    localPreviewUrl ? null : values.image_path || null,
  );

  const set = <K extends keyof ItemFormValues>(field: K, value: ItemFormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (field === "name") setNameError("");
    if (field === "barcode") setLookupResult(undefined);
  };

  const handleBarcodeScan = async (barcode: string) => {
    setShowScanner(false);
    set("barcode", barcode);
    setLookupResult(undefined);
    if (navigator.vibrate) navigator.vibrate(100);
    const info = await lookup(barcode);
    setLookupResult(info);
    if (info?.name) set("name", info.name);
  };

  const handleAddCategory = async (name: string) => {
    const category = await addCategory({ name });
    set("category_id", category.id);
  };

  const handleAddLocation = async (name: string) => {
    const location = await addLocation(name);
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

  const handleImageFile = (file: File) => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const url = URL.createObjectURL(file);
    setLocalPreviewUrl(url);
    onPendingFileChange?.(file);
  };

  const handleImageDelete = () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    set("image_path", "");
    onPendingFileChange?.(null);
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
    }

    const parsedContentAmount = parseFloat(contentAmountRaw);
    if (contentAmountRaw.trim() === "" || isNaN(parsedContentAmount) || parsedContentAmount <= 0) {
      setContentAmountError(t("contentAmountRequired"));
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
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowScanner(true)}
              disabled={isLookingUp}
              title={t("scanBarcode")}
            >
              {isLookingUp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Barcode className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Product lookup result */}
        <ProductLookupResult
          isLoading={isLookingUp}
          product={lookupResult}
          errorType={lookupResult === null ? lookupError : null}
        />

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
            <div className="flex-1 min-w-0">
              <Input
                id="name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t("namePlaceholder")}
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
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
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
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
            placeholder={t("storageLocationPlaceholder")}
            onAdd={handleAddLocation}
            onDelete={handleDeleteLocation}
            addLabel={t("addStorageLocation")}
            confirmLabel={t("common:confirm")}
            cancelLabel={t("common:cancel")}
            addErrorMessage={t("addError")}
          />
        </div>

        {/* Quantity (units × content_amount content_unit) */}
        <div className="space-y-2">
          <Label>{t("units")}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={unitsRaw}
              onChange={(e) => {
                const raw = e.target.value;
                if (!/^\d*$/.test(raw)) return;
                setUnitsRaw(raw);
                setUnitsError("");
                if (raw !== "") set("units", parseInt(raw, 10));
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">点</span>
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
            <Select
              id="content_unit"
              value={values.content_unit}
              onChange={(e) => set("content_unit", e.target.value)}
            >
              {CONTENT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
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

        {/* Image */}
        <div className="space-y-2">
          <Label>{t("image")}</Label>
          <ImageUploader
            previewUrl={localPreviewUrl ?? existingImageUrl}
            onFile={handleImageFile}
            onDelete={values.image_path || localPreviewUrl ? handleImageDelete : undefined}
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
