import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { FloorPlanConflictError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import {
  type FloorPlan,
  type FloorPlanDocument,
  floorPlanDocumentSchema,
  type FloorPlanItemPlacement,
} from "@/types/floorPlan";

const FLOOR_PLANS_KEY = ["floor-plans"] as const;

const getUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user.id;
};

const parseFloorPlan = (row: unknown): FloorPlan => {
  const value = row as FloorPlan;
  return {
    ...value,
    document: floorPlanDocumentSchema.parse(value.document),
  };
};

const fetchFloorPlan = async (storageLocationId: string): Promise<FloorPlan | null> => {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("floor_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("storage_location_id", storageLocationId)
    .maybeSingle();
  if (error) throw error;
  return data ? parseFloorPlan(data) : null;
};

const fetchFloorPlanPlacements = async (floorPlanId: string): Promise<FloorPlanItemPlacement[]> => {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("floor_plan_item_placements")
    .select("*")
    .eq("user_id", userId)
    .eq("floor_plan_id", floorPlanId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FloorPlanItemPlacement[];
};

export const useFloorPlan = (storageLocationId: string) =>
  useQuery({
    queryKey: [...FLOOR_PLANS_KEY, storageLocationId],
    queryFn: () => fetchFloorPlan(storageLocationId),
    enabled: storageLocationId.length > 0,
  });

export const useFloorPlanPlacements = (floorPlanId: string | null) =>
  useQuery({
    queryKey: ["floor-plan-placements", floorPlanId],
    queryFn: () => fetchFloorPlanPlacements(floorPlanId!),
    enabled: !!floorPlanId,
  });

interface UpsertFloorPlanInput {
  id?: string;
  storageLocationId: string;
  name: string;
  document: FloorPlanDocument;
  revision?: number;
}

export const useUpsertFloorPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertFloorPlanInput): Promise<FloorPlan> => {
      requireOnline();
      const userId = await getUserId();
      const document = floorPlanDocumentSchema.parse(input.document);
      const payload = {
        user_id: userId,
        storage_location_id: input.storageLocationId,
        name: input.name.trim(),
        schema_version: document.schemaVersion,
        document,
        revision: input.revision ?? 1,
      };
      const query = input.id
        ? supabase
            .from("floor_plans")
            .update({
              name: payload.name,
              schema_version: payload.schema_version,
              document: payload.document,
              revision: payload.revision + 1,
            })
            .eq("id", input.id)
            .eq("user_id", userId)
            .eq("revision", input.revision ?? 1)
        : supabase.from("floor_plans").insert(payload);
      const { data, error } = await query.select().maybeSingle();
      if (error) throw error;
      if (!data) {
        if (input.id) throw new FloorPlanConflictError();
        throw new Error("Floor plan was not created");
      }
      return parseFloorPlan(data);
    },
    onSuccess: (floorPlan) => {
      void queryClient.invalidateQueries({
        queryKey: [...FLOOR_PLANS_KEY, floorPlan.storage_location_id],
      });
    },
  });
};

interface UpsertPlacementInput {
  floorPlanId: string;
  itemId: string;
  objectId?: string | null;
  x: number;
  y: number;
  z?: number;
  rotation?: number;
}

export const useUpsertFloorPlanPlacement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertPlacementInput): Promise<FloorPlanItemPlacement> => {
      requireOnline();
      const userId = await getUserId();
      const { data, error } = await supabase
        .from("floor_plan_item_placements")
        .upsert(
          {
            user_id: userId,
            floor_plan_id: input.floorPlanId,
            item_id: input.itemId,
            object_id: input.objectId ?? null,
            x: input.x,
            y: input.y,
            z: input.z ?? 0,
            rotation: input.rotation ?? 0,
          },
          { onConflict: "floor_plan_id,item_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as FloorPlanItemPlacement;
    },
    onSuccess: (placement) => {
      void queryClient.invalidateQueries({
        queryKey: ["floor-plan-placements", placement.floor_plan_id],
      });
    },
  });
};
