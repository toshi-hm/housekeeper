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

interface ItemLookupRow {
  name: string;
}

export type BarcodeLookupSource = "db" | "api";

export interface BarcodeLookupResult {
  product: ProductInfo | null;
  source: BarcodeLookupSource | null;
}

export const useBarcodeLookup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<"network" | "not_found" | null>(null);

  const isNetworkError = (message: string | undefined) => {
    const normalized = message?.toLowerCase() ?? "";
    return (
      normalized.includes("fetch") ||
      normalized.includes("network") ||
      normalized.includes("failed to fetch")
    );
  };

  const lookup = async (barcode: string): Promise<BarcodeLookupResult> => {
    if (!barcode.trim()) return { product: null, source: null };

    setIsLoading(true);
    setError(null);
    try {
      const { data: localData, error: localError } = await supabase
        .from("items")
        .select("name")
        .eq("barcode", barcode)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ItemLookupRow>();

      if (!localError && localData?.name) {
        return {
          product: { name: localData.name },
          source: "db",
        };
      }

      const { data, error: fnError } = await supabase.functions.invoke<LookupResult>(
        "barcode-lookup",
        { body: { barcode } },
      );
      if (fnError) {
        const isNetwork = isNetworkError(fnError.message);
        setError(isNetwork ? "network" : "not_found");
        return { product: null, source: null };
      }
      if (!data?.product) return { product: null, source: null };
      return {
        product: {
          name: data.product.name,
          image_url: data.product.image_url ?? undefined,
          description: data.product.description ?? undefined,
          brand: data.product.brand ?? undefined,
        },
        source: "api",
      };
    } catch (err) {
      const isNetwork = err instanceof TypeError && isNetworkError(err.message);
      setError(isNetwork ? "network" : "not_found");
      return { product: null, source: null };
    } finally {
      setIsLoading(false);
    }
  };

  return { lookup, isLoading, error };
};
