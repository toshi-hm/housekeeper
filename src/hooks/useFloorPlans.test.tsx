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
    maybeSingle: () => {
      callLog.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
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

const { useUpsertFloorPlan } = await import("@/hooks/useFloorPlans");

const makeWrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

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
        storageLocationId: "location-1",
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
