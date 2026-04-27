import React, { useState } from "react";
import { Barcode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useBarcodeLookup } from "@/hooks/useBarcodeLookup";
import type { ItemFormValues } from "@/types/item";

const CATEGORIES = [
  "Food",
  "Beverages",
  "Cleaning",
  "Personal Care",
  "Medicine",
  "Electronics",
  "Clothing",
  "Kitchen",
  "Office",
  "Other",
];

interface ItemFormProps {
  defaultValues?: Partial<Record<keyof ItemFormValues, string | number | null | undefined>>;
  onSubmit: (values: ItemFormValues) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function ItemForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel = "Save",
}: ItemFormProps) {
  const [values, setValues] = useState<ItemFormValues>({
    name: defaultValues?.name ?? "",
    barcode: defaultValues?.barcode ?? "",
    category: defaultValues?.category ?? "",
    quantity: defaultValues?.quantity ?? 1,
    storage_location: defaultValues?.storage_location ?? "",
    purchase_date: defaultValues?.purchase_date ?? "",
    expiry_date: defaultValues?.expiry_date ?? "",
    notes: defaultValues?.notes ?? "",
    image_url: defaultValues?.image_url ?? "",
  });
  const [showScanner, setShowScanner] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ItemFormValues, string>>>({});
  const { lookup, isLoading: isLookingUp } = useBarcodeLookup();

  function handleChange(field: keyof ItemFormValues, value: string | number) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleBarcodeScan(barcode: string) {
    setShowScanner(false);
    handleChange("barcode", barcode);
    const info = await lookup(barcode);
    if (info) {
      if (info.name) handleChange("name", info.name);
      if (info.category) handleChange("category", info.category);
      if (info.image_url) handleChange("image_url", info.image_url);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Partial<Record<keyof ItemFormValues, string>> = {};
    if (!values.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(values);
  }

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

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Barcode */}
        <div className="space-y-2">
          <Label htmlFor="barcode">Barcode</Label>
          <div className="flex gap-2">
            <Input
              id="barcode"
              value={values.barcode ?? ""}
              onChange={(e) => handleChange("barcode", e.target.value)}
              placeholder="Scan or enter barcode"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowScanner(true)}
              disabled={isLookingUp}
              title="Scan barcode"
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
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Product name"
            required
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            id="category"
            value={values.category ?? ""}
            onChange={(e) => handleChange("category", e.target.value)}
          >
            <option value="">Select category</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>
        </div>

        {/* Quantity */}
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            min={0}
            value={values.quantity}
            onChange={(e) => handleChange("quantity", parseInt(e.target.value, 10) || 0)}
          />
        </div>

        {/* Storage Location */}
        <div className="space-y-2">
          <Label htmlFor="storage_location">Storage Location</Label>
          <Input
            id="storage_location"
            value={values.storage_location ?? ""}
            onChange={(e) => handleChange("storage_location", e.target.value)}
            placeholder="e.g. Kitchen shelf, Fridge"
          />
        </div>

        {/* Purchase Date */}
        <div className="space-y-2">
          <Label htmlFor="purchase_date">Purchase Date</Label>
          <Input
            id="purchase_date"
            type="date"
            value={values.purchase_date ?? ""}
            onChange={(e) => handleChange("purchase_date", e.target.value)}
          />
        </div>

        {/* Expiry Date */}
        <div className="space-y-2">
          <Label htmlFor="expiry_date">Expiry Date</Label>
          <Input
            id="expiry_date"
            type="date"
            value={values.expiry_date ?? ""}
            onChange={(e) => handleChange("expiry_date", e.target.value)}
          />
        </div>

        {/* Image URL */}
        <div className="space-y-2">
          <Label htmlFor="image_url">Image URL</Label>
          <Input
            id="image_url"
            type="url"
            value={values.image_url ?? ""}
            onChange={(e) => handleChange("image_url", e.target.value)}
            placeholder="https://..."
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={values.notes ?? ""}
            onChange={(e) => handleChange("notes", e.target.value)}
            placeholder="Optional notes"
            rows={3}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </form>
    </>
  );
}
