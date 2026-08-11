import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";

import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import type { ReceiptLineItem } from "@/types/receipt";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ReceiptMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const isReceiptMimeType = (type: string): type is ReceiptMimeType =>
  (ALLOWED_MIME_TYPES as readonly string[]).includes(type);

interface ReceiptScanSuccess {
  items: ReceiptLineItem[];
}

/** `receipt-scan` が特定のエラー種別を返した場合に、UIが専用メッセージを
 *  出し分けられるようにする（`useBarcodeLookup`/`useInventoryChat` と同じ方針）。 */
export type ReceiptScanErrorKind = "unsupported_type" | "rate_limited" | "timeout" | "server_error";

export class ReceiptScanError extends Error {
  readonly kind: ReceiptScanErrorKind;
  constructor(kind: ReceiptScanErrorKind) {
    super(`receipt scan failed: ${kind}`);
    this.name = "ReceiptScanError";
    this.kind = kind;
  }
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      // data:<mime>;base64,<data> のうち先頭のプレフィックスを除去し、
      // Edge Functionには生base64のみを渡す（receipt-scan.md「リクエスト」節）。
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

export const scanReceipt = async (file: File): Promise<ReceiptLineItem[]> => {
  requireOnline();
  if (!isReceiptMimeType(file.type)) {
    throw new ReceiptScanError("unsupported_type");
  }

  const image = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke<ReceiptScanSuccess>("receipt-scan", {
    body: { image, mimeType: file.type },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      if (error.context?.status === 429) throw new ReceiptScanError("rate_limited");
      if (error.context?.status === 504) throw new ReceiptScanError("timeout");
    }
    throw new ReceiptScanError("server_error");
  }

  return data?.items ?? [];
};

export const useReceiptScan = () => {
  return useMutation({
    mutationFn: scanReceipt,
  });
};

export const receiptScanErrorMessageKey = (
  error: unknown,
): "offlineError" | "unsupportedType" | "rateLimited" | "timeout" | "scanError" => {
  if (error instanceof OfflineError) return "offlineError";
  if (error instanceof ReceiptScanError) {
    switch (error.kind) {
      case "unsupported_type":
        return "unsupportedType";
      case "rate_limited":
        return "rateLimited";
      case "timeout":
        return "timeout";
      default:
        return "scanError";
    }
  }
  return "scanError";
};
