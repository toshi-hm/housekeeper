import { type QueryClient, useQuery } from "@tanstack/react-query";

import { compressImageForUpload } from "@/lib/imageCompress";
import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";

export const removeItemImageFile = async (imagePath: string): Promise<void> => {
  requireOnline();
  await supabase.storage.from(BUCKET).remove([imagePath]);
};

export const downloadExternalImageAsFile = async (imageUrl: string): Promise<File> => {
  const { data, error } = await supabase.functions.invoke<{ data: string; contentType: string }>(
    "image-proxy",
    { body: { url: imageUrl } },
  );
  if (error || !data) throw new Error(error?.message ?? "Failed to download image");

  const binaryStr = atob(data.data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const ext = data.contentType.split("/")[1]?.split(";")[0] ?? "jpg";
  return new File([bytes], `product.${ext}`, { type: data.contentType });
};

const BUCKET = "item-images";
const SIGNED_URL_TTL = 60 * 50; // 50 minutes

const getSignedUrl = async (path: string): Promise<string> => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to get signed URL");
  return data.signedUrl;
};

export const useSignedItemImage = (
  imagePath: string | null | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: ["item-image", imagePath],
    queryFn: () => getSignedUrl(imagePath!),
    enabled: !!imagePath && (options?.enabled ?? true),
    staleTime: SIGNED_URL_TTL * 1000 - 60_000, // refresh 1 min before expiry
  });

const getSignedUrls = async (paths: string[]): Promise<Record<string, string>> => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw new Error(error.message);
  const urlsByPath: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urlsByPath[entry.path] = entry.signedUrl;
  }
  return urlsByPath;
};

/**
 * Batches signed-URL creation for many items in a single Storage API call
 * (createSignedUrls) instead of one createSignedUrl call per rendered item.
 */
export const useSignedItemImages = (imagePaths: Array<string | null | undefined>) => {
  const paths = [...new Set(imagePaths.filter((path): path is string => !!path))].sort();

  return useQuery({
    queryKey: ["item-images", paths],
    queryFn: () => getSignedUrls(paths),
    enabled: paths.length > 0,
    staleTime: SIGNED_URL_TTL * 1000 - 60_000,
  });
};

/**
 * Invalidates the cached signed URL(s) for a given Storage path so that
 * uploadItemImage's callers don't keep serving a stale pre-upload signed URL
 * for up to staleTime (~49 min). Storage paths are derived deterministically
 * from itemId + extension (see uploadItemImage), so replacing an image with
 * one of the same extension reuses the same path/queryKey — without this,
 * the old cached URL (pointing at the previous image bytes) would remain
 * fresh and keep being served (#564).
 */
const invalidateSignedItemImageCache = (queryClient: QueryClient, path: string): Promise<void> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["item-image", path] }),
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "item-images" &&
        Array.isArray(query.queryKey[1]) &&
        (query.queryKey[1] as unknown[]).includes(path),
    }),
  ]).then(() => undefined);

interface UploadImageParams {
  itemId: string;
  file: File;
  oldImagePath?: string | null;
  /**
   * Required so uploadItemImage can invalidate the signed-URL cache for the
   * (possibly reused) Storage path after a successful upload — see
   * invalidateSignedItemImageCache above. Pass the QueryClient from
   * useQueryClient() at the call site.
   */
  queryClient: QueryClient;
}

export const uploadItemImage = async ({
  itemId,
  file,
  oldImagePath,
  queryClient,
}: UploadImageParams): Promise<string> => {
  requireOnline();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated");

  // Resize to fit within MAX_EDGE_PX and re-encode as WebP before upload
  // (falls back to the original file untouched if that isn't possible).
  const uploadFile = await compressImageForUpload(file);

  const rawExt = uploadFile.name.includes(".")
    ? uploadFile.name.split(".").pop()?.toLowerCase()
    : undefined;
  const ext = rawExt && rawExt.length <= 5 ? rawExt : "jpg";
  const path = `${user.id}/${itemId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabase
    .from("items")
    .update({ image_path: path })
    .eq("id", itemId);
  if (updateError) {
    // A new extension creates a new object. Roll it back if the DB cannot be
    // updated so the item keeps pointing at its still-existing old image.
    if (path !== oldImagePath) {
      await supabase.storage.from(BUCKET).remove([path]);
    }
    throw new Error(updateError.message);
  }

  // Only retire the previous object after the new path is durable in the DB.
  // Cleanup failure leaves an orphan, but never a broken item image reference.
  if (oldImagePath && oldImagePath !== path) {
    await supabase.storage.from(BUCKET).remove([oldImagePath]);
  }

  await invalidateSignedItemImageCache(queryClient, path);

  return path;
};
