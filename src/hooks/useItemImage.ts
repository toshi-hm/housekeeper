import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";

const BUCKET = "item-images";
const SIGNED_URL_TTL = 60 * 50; // 50 minutes

const getSignedUrl = async (path: string): Promise<string> => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to get signed URL");
  return data.signedUrl;
};

export const useSignedItemImage = (imagePath: string | null | undefined) =>
  useQuery({
    queryKey: ["item-image", imagePath],
    queryFn: () => getSignedUrl(imagePath!),
    enabled: !!imagePath,
    staleTime: SIGNED_URL_TTL * 1000 - 60_000, // refresh 1 min before expiry
  });

interface UploadImageParams {
  itemId: string;
  file: File;
  oldImagePath?: string | null;
}

export const uploadItemImage = async ({
  itemId,
  file,
  oldImagePath,
}: UploadImageParams): Promise<string> => {
  requireOnline();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated");

  const rawExt = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined;
  const ext = rawExt && rawExt.length <= 5 ? rawExt : "jpg";
  const path = `${user.id}/${itemId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  if (oldImagePath && oldImagePath !== path) {
    await supabase.storage.from(BUCKET).remove([oldImagePath]);
  }

  const { error: updateError } = await supabase
    .from("items")
    .update({ image_path: path })
    .eq("id", itemId);
  if (updateError) throw new Error(updateError.message);

  return path;
};

export const useUploadItemImage = (itemId: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: (file: File) => uploadItemImage({ itemId, file }),
    onSuccess: async (path) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: ["item-image", path] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
    },
  });
};

const deleteItemImage = async (itemId: string, imagePath: string): Promise<void> => {
  requireOnline();
  await supabase.storage.from(BUCKET).remove([imagePath]);
  const { error } = await supabase.from("items").update({ image_path: null }).eq("id", itemId);
  if (error) throw new Error(error.message);
};

export const useDeleteItemImage = (itemId: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: (imagePath: string) => deleteItemImage(itemId, imagePath),
    onSuccess: async (_data, imagePath) => {
      qc.removeQueries({ queryKey: ["item-image", imagePath] });
      await qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
    },
  });
};
