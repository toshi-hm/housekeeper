import type { ItemFormValues } from "@/types/item";

export interface ProductInfo {
  name: string;
  /** External image URL (from barcode API). Use onPendingImageUrlChange to download & upload. */
  image_url?: string;
  description?: string;
  brand?: string;
}

type BarcodeLookupSource = "db" | "api";

export interface BarcodeLookupResult {
  product: ProductInfo | null;
  source: BarcodeLookupSource | null;
  /** DBで同一バーコードの商品が見つかったとき、再登録用に引き継ぐ設定。 */
  itemDefaults?: Partial<ItemFormValues>;
  tagIds?: string[];
}
