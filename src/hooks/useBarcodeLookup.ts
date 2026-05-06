import { useState } from "react";

import { supabase } from "@/lib/supabase";

export interface ProductInfo {
  name: string;
  image_url?: string;
  description?: string;
  brand?: string;
}

interface LookupResult {
  product: {
    name: string;
    description: string | null;
    image_url: string | null;
    brand: string | null;
  } | null;
}

export const useBarcodeLookup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (barcode: string): Promise<ProductInfo | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<LookupResult>(
        "barcode-lookup",
        { body: { barcode } },
      );
      if (fnError) throw fnError;
      if (!data?.product) return null;
      return {
        name: data.product.name,
        image_url: data.product.image_url ?? undefined,
        description: data.product.description ?? undefined,
        brand: data.product.brand ?? undefined,
      };
    } catch {
      setError("Failed to look up product");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { lookup, isLoading, error };
};
