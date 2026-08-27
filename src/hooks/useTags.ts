import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { Tag } from "@/types/item";

const TAGS_KEY = ["item-tags"] as const;
const ITEM_TAGS_KEY = ["item-tags-of-item"] as const;

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

// --- Tag master ---

const fetchTags = async (): Promise<Tag[]> => {
  const { data, error } = await supabase
    .from("item_tags")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Tag[];
};

export const useTags = () =>
  useQuery({ queryKey: TAGS_KEY, queryFn: fetchTags, staleTime: 5 * 60_000 });

export const createTag = async (name: string, color?: string | null): Promise<Tag> => {
  requireOnline();
  validateNameLength(name);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("item_tags")
    .insert({ name, color: color ?? null, user_id: user.id })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new DuplicateNameError();
    throw error;
  }
  return data as Tag;
};

export const updateTag = async (id: string, name: string, color?: string | null): Promise<Tag> => {
  requireOnline();
  validateNameLength(name);
  const { data, error } = await supabase
    .from("item_tags")
    .update({ name, color: color ?? null })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new DuplicateNameError();
    throw error;
  }
  return data as Tag;
};

export const useCreateTag = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string | null }) =>
      createTag(name, color),
    onSuccess: (tag) => {
      qc.setQueryData<Tag[]>(TAGS_KEY, (old) => {
        if (!old) return [tag];
        if (old.some((existing) => existing.id === tag.id)) return old;
        return [...old, tag].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof DuplicateNameError) toast(t("settings:duplicateTagName"), "error");
      else if (error instanceof InvalidNameLengthError) toast(t("settings:nameTooLong"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useUpdateTag = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color?: string | null }) =>
      updateTag(id, name, color),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: TAGS_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof DuplicateNameError) toast(t("settings:duplicateTagName"), "error");
      else if (error instanceof InvalidNameLengthError) toast(t("settings:nameTooLong"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useDeleteTag = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: async (id: string) => {
      requireOnline();
      const { error } = await supabase.from("item_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: TAGS_KEY }),
        qc.invalidateQueries({ queryKey: ITEM_TAGS_KEY }),
        qc.invalidateQueries({ queryKey: ["items"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

// --- Tags assigned to a single item ---

const fetchItemTagIds = async (itemId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from("items_to_tags")
    .select("tag_id")
    .eq("item_id", itemId);
  if (error) throw error;
  return (data ?? []).map((row) => row.tag_id as string);
};

export const useItemTagIds = (itemId: string) =>
  useQuery({
    queryKey: [...ITEM_TAGS_KEY, itemId],
    queryFn: () => fetchItemTagIds(itemId),
    enabled: !!itemId,
    staleTime: 30_000,
  });

/** アイテムに紐づくタグを指定の集合へ置き換える（差分 insert / delete）。 */
export const setItemTags = async (itemId: string, tagIds: string[]): Promise<void> => {
  requireOnline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const current = await fetchItemTagIds(itemId);
  const currentSet = new Set(current);
  const nextSet = new Set(tagIds);

  const toAdd = tagIds.filter((id) => !currentSet.has(id));
  const toRemove = current.filter((id) => !nextSet.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("items_to_tags")
      .insert(toAdd.map((tagId) => ({ item_id: itemId, tag_id: tagId, user_id: user.id })));
    if (error) throw error;
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("items_to_tags")
      .delete()
      .eq("item_id", itemId)
      .in("tag_id", toRemove);
    if (error) throw error;
  }
};
