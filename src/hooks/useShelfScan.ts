import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";

import { compressImageForUpload } from "@/lib/imageCompress";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ShelfScanMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const isShelfScanMimeType = (type: string): type is ShelfScanMimeType =>
  (ALLOWED_MIME_TYPES as readonly string[]).includes(type);

interface ShelfScanSuccess {
  items: string[];
}

/** `shelf-scan` が特定のエラー種別を返した場合に、UIが専用メッセージを
 *  出し分けられるようにする（`useReceiptScan`と同じ方針）。 */
export type ShelfScanErrorKind =
  | "unsupported_type"
  | "rate_limited"
  | "timeout"
  | "image_too_large"
  | "server_error"
  | "cancelled";

export class ShelfScanError extends Error {
  readonly kind: ShelfScanErrorKind;
  constructor(kind: ShelfScanErrorKind) {
    super(`shelf scan failed: ${kind}`);
    this.name = "ShelfScanError";
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
      // Edge Functionには生base64のみを渡す（receipt-scanと同じ規約）。
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

/** リクエスト中断（AbortError/DOMExceptionのname、実装によって両方あり得る）か判定する。 */
const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

/** receipt-scanの#923対応と同じく、Edge Functionの25sタイムアウトの間に
 *  ユーザーがキャンセルできるよう、呼び出し元からAbortSignalを渡せるようにする。 */
export const scanShelfPhoto = async (
  file: File,
  signal?: AbortSignal,
): Promise<{ items: string[] }> => {
  requireOnline();
  if (!isShelfScanMimeType(file.type)) {
    throw new ShelfScanError("unsupported_type");
  }

  // receipt-scanの#858対応と同じく、常に圧縮してから送信する（Edge Functionの
  // 8MBペイロード上限に対し、モバイルカメラの生写真は容易に超過するため）。
  const compressed = await compressImageForUpload(file);
  if (signal?.aborted) throw new ShelfScanError("cancelled");
  const image = await fileToBase64(compressed);
  if (signal?.aborted) throw new ShelfScanError("cancelled");
  const { data, error } = await supabase.functions.invoke<ShelfScanSuccess>("shelf-scan", {
    body: { image, mimeType: compressed.type },
    signal,
  });

  if (error) {
    if (isAbortError(error) || signal?.aborted) throw new ShelfScanError("cancelled");
    if (error instanceof FunctionsHttpError) {
      if (error.context?.status === 429) throw new ShelfScanError("rate_limited");
      if (error.context?.status === 504) throw new ShelfScanError("timeout");
      if (error.context?.status === 413) throw new ShelfScanError("image_too_large");
    }
    throw new ShelfScanError("server_error");
  }

  return { items: data?.items ?? [] };
};

interface ScanShelfPhotoVariables {
  file: File;
  signal?: AbortSignal;
}

export const useShelfScan = () => {
  return useMutation({
    mutationFn: ({ file, signal }: ScanShelfPhotoVariables) => scanShelfPhoto(file, signal),
  });
};

export const shelfScanErrorMessageKey = (
  error: unknown,
):
  | "offlineError"
  | "unsupportedType"
  | "rateLimited"
  | "timeout"
  | "imageTooLarge"
  | "scanError" => {
  if (error instanceof OfflineError) return "offlineError";
  if (error instanceof ShelfScanError) {
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
