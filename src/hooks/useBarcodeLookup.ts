import { useState } from "react";

import { supabase } from "@/lib/supabase";
import type { BarcodeLookupResult, ProductInfo } from "@/types/barcode";

export type { BarcodeLookupResult, ProductInfo };

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
  image_path: string | null;
}

/** "not_found"（該当商品なし）は成功レスポンス（200 + product: null）として
 *  扱われるため、このフックがエラー状態として設定するのは network / server_error
 *  のみ。#655 */
export type BarcodeLookupErrorType = "network" | "server_error";

export const useBarcodeLookup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<BarcodeLookupErrorType | null>(null);

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
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Not authenticated");

      const { data: localData, error: localError } = await supabase
        .from("items")
        .select("name, image_path")
        .eq("barcode", barcode)
        .eq("user_id", userData.user.id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<ItemLookupRow>();

      if (!localError && localData?.name) {
        let image_url: string | undefined;
        if (localData.image_path) {
          const { data: signedData } = await supabase.storage
            .from("item-images")
            .createSignedUrl(localData.image_path, 60 * 50);
          image_url = signedData?.signedUrl ?? undefined;
        }
        return {
          product: { name: localData.name, image_url },
          source: "db",
        };
      }

      const { data, error: fnError } = await supabase.functions.invoke<LookupResult>(
        "barcode-lookup",
        { body: { barcode } },
      );
      if (fnError) {
        // #655: barcode-lookup only ever returns a non-2xx response for
        // genuine server-side problems (invalid request, missing API
        // config, upstream failure) — a real "no such product" is always a
        // 200 with product: null (handled below). So any non-network fnError
        // here is a server error, never "not found".
        const isNetwork = isNetworkError(fnError.message);
        setError(isNetwork ? "network" : "server_error");
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
      // #655: unexpected exceptions here (auth failure, thrown fetch
      // errors, etc.) are never "no such product" either.
      const isNetwork = err instanceof TypeError && isNetworkError(err.message);
      setError(isNetwork ? "network" : "server_error");
      return { product: null, source: null };
    } finally {
      setIsLoading(false);
    }
  };

  return { lookup, isLoading, error };
};
