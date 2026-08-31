import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

import { FloorPlanConflictError } from "@/lib/requireOnline";
import { createEmptyFloorPlanDocument } from "@/types/floorPlan";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
const responseQueues: Record<string, SupabaseResponse[]> = {};

const makeBuilder = (table: string, response: SupabaseResponse) => {
  const builder: Record<string, unknown> = {};
  const chainMethod =
    (method: string) =>
    (...args: unknown[]) => {
      callLog.push({ table, method, args });
      return builder;
    };

  Object.assign(builder, {
    select: chainMethod("select"),
    eq: chainMethod("eq"),
    update: chainMethod("update"),
    insert: chainMethod("insert"),
    upsert: chainMethod("upsert"),
    delete: chainMethod("delete"),
    maybeSingle: () => {
      callLog.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
    single: () => {
      callLog.push({ table, method: "single", args: [] });
      return Promise.resolve(response);
    },
    then: (resolve: (value: SupabaseResponse) => unknown) => resolve(response),
  });
  return builder;
};

const fromMock = mock((table: string) => {
  const queue = responseQueues[table];
  const response = queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
  return makeBuilder(table, response);
});

const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { useUpsertFloorPlan, useUpsertFloorPlanStorageLocationMarker, useDeleteFloorPlanPlacement } =
  await import("@/hooks/useFloorPlans");
const { ToastContext } = await import("@/lib/toast-context");

const makeWrapper = (queryClient: QueryClient) => {
  const stubToast = { toasts: [], toast: () => "", dismiss: () => {} };
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ToastContext, { value: stubToast }, children),
    );
};

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("useUpsertFloorPlan", () => {
  test("stale revision is reported as FloorPlanConflictError", async () => {
    responseQueues.floor_plans = [{ data: null, error: null }];
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useUpsertFloorPlan(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        id: "plan-1",
        name: "Kitchen",
        document: createEmptyFloorPlanDocument(),
        revision: 3,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(FloorPlanConflictError);
    expect(callLog).toContainEqual({ table: "floor_plans", method: "eq", args: ["revision", 3] });
    expect(callLog).toContainEqual({ table: "floor_plans", method: "maybeSingle", args: [] });
  });
});

describe("useUpsertFloorPlanStorageLocationMarker", () => {
  test("upserts a marker for the shared floor plan and storage location", async () => {
    responseQueues.floor_plan_storage_location_markers = [
      {
        data: {
          id: "marker-1",
          user_id: "user-1",
          floor_plan_id: "plan-1",
          storage_location_id: "location-1",
          object_id: null,
          x: 120,
          y: 80,
          z: 0,
          rotation: 0,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        error: null,
      },
    ];
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useUpsertFloorPlanStorageLocationMarker(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({
        floorPlanId: "plan-1",
        storageLocationId: "location-1",
        x: 120,
        y: 80,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callLog).toContainEqual({
      table: "floor_plan_storage_location_markers",
      method: "upsert",
      args: [
        {
          user_id: "user-1",
          floor_plan_id: "plan-1",
          storage_location_id: "location-1",
          object_id: null,
          x: 120,
          y: 80,
          z: 0,
          rotation: 0,
        },
        { onConflict: "floor_plan_id,storage_location_id" },
      ],
    });
  });
});

describe("useDeleteFloorPlanPlacement", () => {
  test("配置を削除し、対象の間取りの配置一覧キャッシュを無効化する", async () => {
    responseQueues.floor_plan_item_placements = [{ data: null, error: null }];
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = mock(() => Promise.resolve());
    queryClient.invalidateQueries =
      invalidateSpy as unknown as typeof queryClient.invalidateQueries;

    const { result } = renderHook(() => useDeleteFloorPlanPlacement(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ id: "placement-1", floorPlanId: "plan-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(callLog).toContainEqual({
      table: "floor_plan_item_placements",
      method: "delete",
      args: [],
    });
    expect(callLog).toContainEqual({
      table: "floor_plan_item_placements",
      method: "eq",
      args: ["id", "placement-1"],
    });
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toContainEqual(["floor-plan-placements", "plan-1"]);
  });
});
