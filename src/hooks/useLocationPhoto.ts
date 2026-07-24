import { type QueryClient, useQuery } from "@tanstack/react-query";

import { compressImageForUpload } from "@/lib/imageCompress";
import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";

const BUCKET = "location-photos";
const SIGNED_URL_TTL = 60 * 50; // 50 minutes

const removeLocationPhotoFile = async (photoPath: string): Promise<void> => {
  requireOnline();
  await supabase.storage.from(BUCKET).remove([photoPath]);
};

const getSignedUrl = async (path: string): Promise<string> => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to get signed URL");
  return data.signedUrl;
};

export const useSignedLocationPhoto = (
  photoPath: string | null | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: ["location-photo", photoPath],
    queryFn: () => getSignedUrl(photoPath!),
    enabled: !!photoPath && (options?.enabled ?? true),
    staleTime: SIGNED_URL_TTL * 1000 - 60_000,
  });

const invalidateSignedLocationPhotoCache = (
  queryClient: QueryClient,
  path: string,
): Promise<void> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["location-photo", path] }),
    queryClient.invalidateQueries({ queryKey: ["locations"] }),
  ]).then(() => undefined);

interface UploadLocationPhotoParams {
  locationId: string;
  file: File;
  oldPhotoPath?: string | null;
  queryClient: QueryClient;
}

export const uploadLocationPhoto = async ({
  locationId,
  file,
  oldPhotoPath,
  queryClient,
}: UploadLocationPhotoParams): Promise<string> => {
  requireOnline();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated");

  const uploadFile = await compressImageForUpload(file);

  const rawExt = uploadFile.name.includes(".")
    ? uploadFile.name.split(".").pop()?.toLowerCase()
    : undefined;
  const ext = rawExt && rawExt.length <= 5 ? rawExt : "jpg";
  const path = `${user.id}/${locationId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabase
    .from("storage_locations")
    .update({ photo_path: path })
    .eq("id", locationId);
  if (updateError) {
    if (path !== oldPhotoPath) {
      await supabase.storage.from(BUCKET).remove([path]);
    }
    throw new Error(updateError.message);
  }

  if (oldPhotoPath && oldPhotoPath !== path) {
    await supabase.storage.from(BUCKET).remove([oldPhotoPath]);
  }

  await invalidateSignedLocationPhotoCache(queryClient, path);

  return path;
};

export const deleteLocationPhoto = async (
  locationId: string,
  photoPath: string,
  queryClient: QueryClient,
): Promise<void> => {
  requireOnline();
  const { error: updateError } = await supabase
    .from("storage_locations")
    .update({ photo_path: null })
    .eq("id", locationId);
  if (updateError) throw new Error(updateError.message);

  await removeLocationPhotoFile(photoPath);
  await invalidateSignedLocationPhotoCache(queryClient, photoPath);
};
