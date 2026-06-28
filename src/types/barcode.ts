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
}
