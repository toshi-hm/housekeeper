import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { Category, StorageLocation } from "@/types/item";

const CATEGORIES_KEY = ["categories"] as const;
const LOCATIONS_KEY = ["locations"] as const;

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

/** Raised when the atomic `delete_*_if_unused` RPC finds the category/location
 *  still referenced by an item at delete time (see #491) — including items
 *  assigned concurrently by another device after any earlier usage check. */
export class CategoryInUseError extends Error {
  constructor() {
    super("Category is in use");
    this.name = "CategoryInUseError";
  }
}

export class LocationInUseError extends Error {
  constructor() {
    super("Storage location is in use");
    this.name = "LocationInUseError";
  }
}

const CATEGORY_IN_USE_ERRCODE = "HK001";
const LOCATION_IN_USE_ERRCODE = "HK002";

const validateNameLength = (name: string): void => {
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) throw new InvalidNameLengthError();
};

// --- Categories ---

const fetchCategories = async (): Promise<Category[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
};

export const createCategory = async (
  name: string,
  color?: string | null,
  icon?: string | null,
): Promise<Category> => {
  requireOnline();
  validateNameLength(name);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("categories")
    .insert({ name, color: color ?? null, icon: icon ?? null, user_id: userData.user.id })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new DuplicateNameError();
    throw error;
  }
  return data as Category;
};

export const updateCategory = async (
  id: string,
  name: string,
  color?: string | null,
  icon?: string | null,
): Promise<Category> => {
  requireOnline();
  validateNameLength(name);
  const { data, error } = await supabase
    .from("categories")
    .update({
      name,
      color: color ?? null,
      icon: icon ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new DuplicateNameError();
    throw error;
  }
  return data as Category;
};

/** Deletes a category only if no active item still references it, checked
 *  atomically inside the `delete_category_if_unused` DB function (#491) —
 *  this re-check happens immediately before the DELETE within a single
 *  statement, closing the race window that an earlier client-side
 *  `checkCategoryUsage` call cannot. */
export const deleteCategory = async (id: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase.rpc("delete_category_if_unused", { p_id: id });
  if (error) {
    if (error.code === CATEGORY_IN_USE_ERRCODE) throw new CategoryInUseError();
    throw error;
  }
};

export const checkCategoryUsage = async (id: string): Promise<number> => {
  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
};

export const useCategories = () =>
  useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

export const useCreateCategory = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: ({
      name,
      color,
      icon,
    }: {
      name: string;
      color?: string | null;
      icon?: string | null;
    }) => createCategory(name, color, icon),
    onSuccess: (category) => {
      qc.setQueryData<Category[]>(CATEGORIES_KEY, (old) => {
        if (!old) return [category];
        if (old.some((c) => c.id === category.id)) return old;
        return [...old, category].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof DuplicateNameError)
        toast(t("settings:duplicateCategoryName"), "error");
      else if (error instanceof InvalidNameLengthError) toast(t("settings:nameTooLong"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useUpdateCategory = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: ({
      id,
      name,
      color,
      icon,
    }: {
      id: string;
      name: string;
      color?: string | null;
      icon?: string | null;
    }) => updateCategory(id, name, color, icon),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof DuplicateNameError)
        toast(t("settings:duplicateCategoryName"), "error");
      else if (error instanceof InvalidNameLengthError) toast(t("settings:nameTooLong"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
        qc.invalidateQueries({ queryKey: ["items"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof CategoryInUseError) toast(t("settings:categoryInUse"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

// --- Storage Locations ---

const fetchStorageLocations = async (): Promise<StorageLocation[]> => {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("storage_locations")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StorageLocation[];
};

export const createStorageLocation = async (
  name: string,
  icon?: string | null,
): Promise<StorageLocation> => {
  requireOnline();
  validateNameLength(name);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("storage_locations")
    .insert({ name, icon: icon ?? null, user_id: userData.user.id })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new DuplicateNameError();
    throw error;
  }
  return data as StorageLocation;
};

export const updateStorageLocation = async (
  id: string,
  name: string,
  icon?: string | null,
): Promise<StorageLocation> => {
  requireOnline();
  validateNameLength(name);
  const { data, error } = await supabase
    .from("storage_locations")
    .update({ name, icon: icon ?? null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new DuplicateNameError();
    throw error;
  }
  return data as StorageLocation;
};

/** Deletes a storage location only if no active item still references it,
 *  checked atomically inside the `delete_storage_location_if_unused` DB
 *  function (#491) — see deleteCategory for the rationale. */
export const deleteStorageLocation = async (id: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase.rpc("delete_storage_location_if_unused", { p_id: id });
  if (error) {
    if (error.code === LOCATION_IN_USE_ERRCODE) throw new LocationInUseError();
    throw error;
  }
};

export const checkLocationUsage = async (id: string): Promise<number> => {
  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("storage_location_id", id)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
};

export const useStorageLocations = () =>
  useQuery({
    queryKey: LOCATIONS_KEY,
    queryFn: fetchStorageLocations,
    staleTime: 5 * 60_000,
  });

export const useCreateStorageLocation = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: ({ name, icon }: { name: string; icon?: string | null }) =>
      createStorageLocation(name, icon),
    onSuccess: (location) => {
      qc.setQueryData<StorageLocation[]>(LOCATIONS_KEY, (old) => {
        if (!old) return [location];
        if (old.some((l) => l.id === location.id)) return old;
        return [...old, location].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof DuplicateNameError)
        toast(t("settings:duplicateLocationName"), "error");
      else if (error instanceof InvalidNameLengthError) toast(t("settings:nameTooLong"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useUpdateStorageLocation = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: ({ id, name, icon }: { id: string; name: string; icon?: string | null }) =>
      updateStorageLocation(id, name, icon),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof DuplicateNameError)
        toast(t("settings:duplicateLocationName"), "error");
      else if (error instanceof InvalidNameLengthError) toast(t("settings:nameTooLong"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

export const useDeleteStorageLocation = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: deleteStorageLocation,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: LOCATIONS_KEY }),
        qc.invalidateQueries({ queryKey: ["items"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else if (error instanceof LocationInUseError) toast(t("settings:locationInUse"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};
