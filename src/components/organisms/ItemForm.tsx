import { Barcode, Loader2 } from "lucide-react";
import { type FormEvent,useState } from "react";
import { useTranslation } from "react-i18next";

import { BarcodeScanner } from "@/components/organisms/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useBarcodeLookup } from "@/hooks/useBarcodeLookup";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import { CONTENT_UNITS, type ItemFormValues } from "@/types/item";

interface ItemFormProps {
  defaultValues?: Partial<ItemFormValues>;
  onSubmit: (values: ItemFormValues) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export const ItemForm = ({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
}: ItemFormProps) => {
  const { t } = useTranslation("items");
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { lookup, isLoading: isLookingUp } = useBarcodeLookup();

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
  const [showScanner, setShowScanner] = useState(false);
  const [nameError, setNameError] = useState("");

  const set = <K extends keyof ItemFormValues>(field: K, value: ItemFormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (field === "name") setNameError("");
  };

  const handleBarcodeScan = async (barcode: string) => {
    setShowScanner(false);
    set("barcode", barcode);
    const info = await lookup(barcode);
    if (info?.name) set("name", info.name);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setNameError(t("common:required"));
      return;
    }
    onSubmit({
      ...values,
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
          onScan={(barcode) => { void handleBarcodeScan(barcode); }}
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

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")} *</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t("namePlaceholder")}
          />
          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category_id">{t("category")}</Label>
          <Select
            id="category_id"
            value={values.category_id ?? ""}
            onChange={(e) => set("category_id", e.target.value || null)}
          >
            <option value="">{t("categoryPlaceholder")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>

        {/* Storage Location */}
        <div className="space-y-2">
          <Label htmlFor="storage_location_id">{t("storageLocation")}</Label>
          <Select
            id="storage_location_id"
            value={values.storage_location_id ?? ""}
            onChange={(e) => set("storage_location_id", e.target.value || null)}
          >
            <option value="">{t("storageLocationPlaceholder")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>

        {/* Quantity (units × content_amount content_unit) */}
        <div className="space-y-2">
          <Label>{t("units")}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={values.units}
              onChange={(e) => set("units", parseInt(e.target.value, 10) || 0)}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">点</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="content_amount">{t("contentAmount")}</Label>
            <Input
              id="content_amount"
              type="number"
              min={0.01}
              step={0.01}
              value={values.content_amount}
              onChange={(e) => set("content_amount", parseFloat(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content_unit">{t("contentUnit")}</Label>
            <Select
              id="content_unit"
              value={values.content_unit}
              onChange={(e) => set("content_unit", e.target.value)}
            >
              {CONTENT_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
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

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel ?? t("common:save")}
        </Button>
      </form>
    </>
  );
};
