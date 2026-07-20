/**
 * Client-side image resize + WebP re-encode before uploading to Supabase
 * Storage. Runs entirely in the browser via canvas; see
 * docs/specs/features/storage.md.
 *
 * The pure decision helpers (`calculateTargetDimensions`, `needsResize`,
 * `pickOutputFormat`) are unit-testable in isolation. `compressImageForUpload`
 * itself drives `createImageBitmap` + `<canvas>`, which happy-dom does not
 * implement, so it is exercised manually / in E2E rather than `bun test`.
 */

export interface Dimensions {
  width: number;
  height: number;
}

export interface OutputFormat {
  type: string;
  extension: string;
}

/** Long edge (px) that uploaded images are downscaled to fit within. */
export const MAX_EDGE_PX = 1280;

/** JPEG/WebP re-encode quality (0-1). */
export const OUTPUT_QUALITY = 0.8;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Computes the resized dimensions so the longer edge is at most `maxEdge`,
 * preserving aspect ratio. Never upscales: images already within the limit
 * are returned unchanged.
 */
export const calculateTargetDimensions = (
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): Dimensions => {
  const longEdge = Math.max(width, height);
  if (longEdge <= 0 || longEdge <= maxEdge) return { width, height };

  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/** Whether the given source dimensions exceed `maxEdge` and need resizing. */
export const needsResize = (
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): boolean => Math.max(width, height) > maxEdge;

/**
 * Decides the output mime type/extension for the re-encoded image.
 * Prefers WebP when the runtime can actually encode it; otherwise falls
 * back to the original file's format (jpeg/png), or jpeg if the original
 * type is unrecognized, so re-encoding never fails outright.
 */
export const pickOutputFormat = (originalType: string, webpSupported: boolean): OutputFormat => {
  if (webpSupported) return { type: "image/webp", extension: "webp" };

  const fallbackType = originalType in EXTENSION_BY_TYPE ? originalType : "image/jpeg";
  return { type: fallbackType, extension: EXTENSION_BY_TYPE[fallbackType] ?? "jpg" };
};

let webpSupportCache: boolean | null = null;

/**
 * Feature-detects WebP *encoding* support (decoding-only support is not
 * enough — some environments can display WebP but not produce it via
 * canvas). Result is cached for the lifetime of the page.
 */
export const detectWebpEncodeSupport = (): boolean => {
  if (webpSupportCache !== null) return webpSupportCache;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupportCache = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupportCache = false;
  }
  return webpSupportCache;
};

/** Test-only hook to reset the memoized WebP support check. */
export const _resetWebpSupportCacheForTests = (): void => {
  webpSupportCache = null;
};

const stripExtension = (name: string): string => name.replace(/\.[^./]+$/, "");

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

/**
 * Resizes `file` to fit within `maxEdge` on its longer side and re-encodes
 * it as WebP (falling back to the original format when WebP encoding isn't
 * available). Returns the original file unchanged whenever:
 * - decoding fails (corrupt/unsupported image)
 * - canvas 2D context is unavailable
 * - re-encoding produces no blob
 * - the file already fits and no format change is needed
 *
 * This function never throws — upload should proceed with the original
 * file rather than fail outright when compression isn't possible.
 */
export const compressImageForUpload = async (
  file: File,
  maxEdge: number = MAX_EDGE_PX,
): Promise<File> => {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const format = pickOutputFormat(file.type, detectWebpEncodeSupport());
    const target = calculateTargetDimensions(bitmap.width, bitmap.height, maxEdge);

    if (!needsResize(bitmap.width, bitmap.height, maxEdge) && format.type === file.type) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await canvasToBlob(canvas, format.type, OUTPUT_QUALITY);
    if (!blob) return file;

    const baseName = stripExtension(file.name) || "image";
    return new File([blob], `${baseName}.${format.extension}`, { type: format.type });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
};
