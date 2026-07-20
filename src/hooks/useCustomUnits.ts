import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { CustomUnit } from "@/types/item";

const CUSTOM_UNITS_KEY = ["custom-units"] as const;

const MAX_NAME_LENGTH = 40;

export class DuplicateNameError extends Error {
  constructor() {
    super("Duplicate name");
    this.name = "DuplicateNameError";
  }
}

export class InvalidNameLengthError extends Error {
  constructor() {
    super("Name exceeds maximum length");
    this.name = "InvalidNameLengthError";
  }
}

const validateNameLength = (name: string): void => {
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) throw new InvalidNameLengthError();
};

const fetchCustomUnits = async (): Promise<CustomUnit[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("custom_units")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomUnit[];
};

export const createCustomUnit = async (name: string): Promise<CustomUnit> => {
  requireOnline();
  validateNameLength(name);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("custom_units")
    .insert({ name, user_id: userData.user.id })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new DuplicateNameError();
    throw error;
  }
  return data as CustomUnit;
};

/** カスタム単位を削除する。`items.content_unit` は外部キーではなく単なる text の
 *  コピーなので、categories/storage_locations と異なり「使用中チェック」は不要 —
 *  既存アイテムの content_unit 値はこの削除の影響を受けない。 */
export const deleteCustomUnit = async (id: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase.from("custom_units").delete().eq("id", id);
  if (error) throw error;
};

export const useCustomUnits = () =>
  useQuery({
    queryKey: CUSTOM_UNITS_KEY,
    queryFn: fetchCustomUnits,
    staleTime: 5 * 60_000,
  });

export const useCreateCustomUnit = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: (name: string) => createCustomUnit(name),
    onSuccess: (unit) => {
      qc.setQueryData<CustomUnit[]>(CUSTOM_UNITS_KEY, (old) => {
        if (!old) return [unit];
        if (old.some((u) => u.id === unit.id)) return old;
        return [...old, unit].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof DuplicateNameError)
        toast(t("settings:duplicateCustomUnitName"), "error");
      else if (error instanceof InvalidNameLengthError) toast(t("settings:nameTooLong"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useDeleteCustomUnit = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: deleteCustomUnit,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: CUSTOM_UNITS_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
