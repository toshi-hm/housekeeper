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
  const [error, setError] = useState<"network" | "not_found" | null>(null);

  const lookup = async (barcode: string): Promise<ProductInfo | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<LookupResult>(
        "barcode-lookup",
        { body: { barcode } },
      );
      if (fnError) {
        const isNetwork =
          fnError.message?.toLowerCase().includes("fetch") ||
          fnError.message?.toLowerCase().includes("network") ||
          fnError.message?.toLowerCase().includes("failed to fetch");
        setError(isNetwork ? "network" : "not_found");
        return null;
      }
      if (!data?.product) return null;
      return {
        name: data.product.name,
        image_url: data.product.image_url ?? undefined,
        description: data.product.description ?? undefined,
        brand: data.product.brand ?? undefined,
      };
    } catch (err) {
      const isNetwork =
        err instanceof TypeError &&
        (err.message.includes("fetch") || err.message.includes("network"));
      setError(isNetwork ? "network" : "not_found");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { lookup, isLoading, error };
};
