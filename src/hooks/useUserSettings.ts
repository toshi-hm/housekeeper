import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import type { UserSettings } from "@/types/item";

const SETTINGS_KEY = ["settings"] as const;

const fetchUserSettings = async (): Promise<UserSettings | null> => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userData.user.id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as UserSettings) ?? null;
};

const upsertUserSettings = async (
  values: Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>,
): Promise<UserSettings> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("user_settings")
    .upsert({ ...values, user_id: userData.user.id })
    .select()
    .single();
  if (error) throw error;
  return data as UserSettings;
};

export const useUserSettings = () => {
  const { i18n } = useTranslation();
  const result = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchUserSettings,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (result.data?.language) {
      void i18n.changeLanguage(result.data.language);
    }
  }, [result.data?.language, i18n]);

  return result;
};

export const useUpdateUserSettings = () => {
  const qc = useQueryClient();
  const { i18n } = useTranslation();
  return useMutation({
    mutationFn: upsertUserSettings,
    onSuccess: (data) => {
      qc.setQueryData(SETTINGS_KEY, data);
      if (data.language) void i18n.changeLanguage(data.language);
    },
  });
};
