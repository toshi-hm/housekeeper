import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";

import { compressImageForUpload } from "@/lib/imageCompress";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import type { ReceiptLineItem, ReceiptScanResult } from "@/types/receipt";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ReceiptMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const isReceiptMimeType = (type: string): type is ReceiptMimeType =>
  (ALLOWED_MIME_TYPES as readonly string[]).includes(type);

interface ReceiptScanSuccess {
  items: ReceiptLineItem[];
  storeName: string | null;
}

/** `receipt-scan` が特定のエラー種別を返した場合に、UIが専用メッセージを
 *  出し分けられるようにする（`useBarcodeLookup`/`useInventoryChat` と同じ方針）。 */
export type ReceiptScanErrorKind =
  | "unsupported_type"
  | "rate_limited"
  | "timeout"
  | "image_too_large"
  | "server_error";

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

export const scanReceipt = async (file: File): Promise<ReceiptScanResult> => {
  requireOnline();
  if (!isReceiptMimeType(file.type)) {
    throw new ReceiptScanError("unsupported_type");
  }

  // #858: uploadItemImage always compresses before upload; receipt-scan reused
  // ImageUploader (which only guards against pathologically large picks) without
  // ever shrinking the file, so ordinary 6-15MB phone photos exceeded the Edge
  // Function's 8MB payload limit and failed with a generic error.
  const compressed = await compressImageForUpload(file);
  const image = await fileToBase64(compressed);
  const { data, error } = await supabase.functions.invoke<ReceiptScanSuccess>("receipt-scan", {
    body: { image, mimeType: compressed.type },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      if (error.context?.status === 429) throw new ReceiptScanError("rate_limited");
      if (error.context?.status === 504) throw new ReceiptScanError("timeout");
      if (error.context?.status === 413) throw new ReceiptScanError("image_too_large");
    }
    throw new ReceiptScanError("server_error");
  }

  return { items: data?.items ?? [], storeName: data?.storeName ?? null };
};

export const useReceiptScan = () => {
  return useMutation({
    mutationFn: scanReceipt,
  });
};

export const receiptScanErrorMessageKey = (
  error: unknown,
):
  | "offlineError"
  | "unsupportedType"
  | "rateLimited"
  | "timeout"
  | "imageTooLarge"
  | "scanError" => {
  if (error instanceof OfflineError) return "offlineError";
  if (error instanceof ReceiptScanError) {
    switch (error.kind) {
      case "unsupported_type":
        return "unsupportedType";
      case "rate_limited":
        return "rateLimited";
      case "timeout":
        return "timeout";
      case "image_too_large":
        return "imageTooLarge";
      default:
        return "scanError";
    }
  }
  return "scanError";
};
