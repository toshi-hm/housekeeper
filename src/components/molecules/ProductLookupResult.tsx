import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ProductInfo } from "@/hooks/useBarcodeLookup";

interface ProductLookupResultProps {
  isLoading: boolean;
  product: ProductInfo | null | undefined;
}

export const ProductLookupResult = ({ isLoading, product }: ProductLookupResultProps) => {
  const { t } = useTranslation("items");

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span>{t("productSearching")}</span>
      </div>
    );
  }

  if (product === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{t("productNotFound")}</span>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
      {product.image_url && (
        <img
          src={product.image_url}
          alt={product.name}
          className="h-16 w-16 shrink-0 rounded object-contain"
        />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start gap-1">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium text-green-900 dark:text-green-100">{product.name}</p>
        </div>
        {product.brand && (
          <p className="text-xs text-muted-foreground">
            {t("productBrand")}: {product.brand}
          </p>
        )}
        {product.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
        )}
      </div>
    </div>
  );
};
