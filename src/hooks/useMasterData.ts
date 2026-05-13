import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import type { Category, StorageLocation } from "@/types/item";

const CATEGORIES_KEY = ["categories"] as const;
const LOCATIONS_KEY = ["locations"] as const;

// --- Categories ---

const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
};

const createCategory = async (name: string, color?: string | null): Promise<Category> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("categories")
    .insert({ name, color: color ?? null, user_id: userData.user.id })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: findError } = await supabase
        .from("categories")
        .select()
        .eq("user_id", userData.user.id)
        .eq("name", name)
        .single();
      if (findError) throw findError;
      if (!existing) throw error;
      return existing as Category;
    }
    throw error;
  }
  return data as Category;
};

const updateCategory = async (
  id: string,
  name: string,
  color?: string | null,
): Promise<Category> => {
  requireOnline();
  const { data, error } = await supabase
    .from("categories")
    .update({ name, color: color ?? null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Category;
};

const deleteCategory = async (id: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
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
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string | null }) =>
      createCategory(name, color),
    onSuccess: (category) => {
      qc.setQueryData<Category[]>(CATEGORIES_KEY, (old) => {
        if (!old) return [category];
        if (old.some((c) => c.id === category.id)) return old;
        return [...old, category].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
  });
};

export const useUpdateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color?: string | null }) =>
      updateCategory(id, name, color),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
        qc.invalidateQueries({ queryKey: ["items"] }),
      ]);
    },
  });
};

// --- Storage Locations ---

const fetchStorageLocations = async (): Promise<StorageLocation[]> => {
  const { data, error } = await supabase
    .from("storage_locations")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StorageLocation[];
};

const createStorageLocation = async (name: string): Promise<StorageLocation> => {
  requireOnline();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("storage_locations")
    .insert({ name, user_id: userData.user.id })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: findError } = await supabase
        .from("storage_locations")
        .select()
        .eq("user_id", userData.user.id)
        .eq("name", name)
        .single();
      if (findError) throw findError;
      if (!existing) throw error;
      return existing as StorageLocation;
    }
    throw error;
  }
  return data as StorageLocation;
};

const updateStorageLocation = async (id: string, name: string): Promise<StorageLocation> => {
  requireOnline();
  const { data, error } = await supabase
    .from("storage_locations")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as StorageLocation;
};

const deleteStorageLocation = async (id: string): Promise<void> => {
  requireOnline();
  const { error } = await supabase.from("storage_locations").delete().eq("id", id);
  if (error) throw error;
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
  return useMutation({
    mutationFn: createStorageLocation,
    onSuccess: (location) => {
      qc.setQueryData<StorageLocation[]>(LOCATIONS_KEY, (old) => {
        if (!old) return [location];
        if (old.some((l) => l.id === location.id)) return old;
        return [...old, location].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
  });
};

export const useUpdateStorageLocation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateStorageLocation(id, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
    },
  });
};

export const useDeleteStorageLocation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteStorageLocation,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: LOCATIONS_KEY }),
        qc.invalidateQueries({ queryKey: ["items"] }),
      ]);
    },
  });
};
