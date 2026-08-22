import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { RecipeShortage, RecipeWithItems } from "@/types/recipe";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
const responseQueues: Record<string, SupabaseResponse[]> = {};

const defaultResponse: SupabaseResponse = { data: [], error: null };

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
    gte: chainMethod("gte"),
    lte: chainMethod("lte"),
    is: chainMethod("is"),
    in: chainMethod("in"),
    limit: chainMethod("limit"),
    order: chainMethod("order"),
    insert: chainMethod("insert"),
    upsert: chainMethod("upsert"),
    update: chainMethod("update"),
    delete: chainMethod("delete"),
    single: () => {
      callLog.push({ table, method: "single", args: [] });
      return Promise.resolve(response);
    },
    maybeSingle: () => {
      callLog.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve(response);
    },
    then: (resolve: (v: SupabaseResponse) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(response).then(resolve, reject),
  });
  return builder;
};

const fromMock = mock((table: string) => {
  const queue = responseQueues[table];
  const response = queue && queue.length > 0 ? queue.shift()! : defaultResponse;
  return makeBuilder(table, response);
});

const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { upsertMealPlan, shortageToShoppingItemInput } = await import("@/hooks/useMealPlans");

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("upsertMealPlan", () => {
  test("recipe_id/noteどちらも無ければupsertせず行を削除する(未割当)", async () => {
    const result = await upsertMealPlan({
      planned_date: "2026-08-12",
      recipe_id: null,
      note: null,
    });

    expect(result).toBeNull();
    expect(callLog).toEqual([
      { table: "meal_plans", method: "delete", args: [] },
      { table: "meal_plans", method: "eq", args: ["user_id", "user-1"] },
      { table: "meal_plans", method: "eq", args: ["planned_date", "2026-08-12"] },
    ]);
  });

  test("recipe_idがあればuser_id,planned_dateでupsertする", async () => {
    responseQueues.meal_plans = [
      {
        data: {
          id: "mp1",
          user_id: "user-1",
          planned_date: "2026-08-12",
          recipe_id: "r1",
          note: null,
          executed_at: null,
          created_at: "",
          updated_at: "",
        },
        error: null,
      },
    ];

    const result = await upsertMealPlan({ planned_date: "2026-08-12", recipe_id: "r1" });

    expect(result?.recipe_id).toBe("r1");
    const upsertCall = callLog.find((c) => c.table === "meal_plans" && c.method === "upsert");
    expect(upsertCall?.args[0]).toEqual({
      user_id: "user-1",
      planned_date: "2026-08-12",
      recipe_id: "r1",
      note: null,
      executed_at: null,
    });
    expect(upsertCall?.args[1]).toEqual({ onConflict: "user_id,planned_date" });
  });

  test("noteのみでもupsertする(recipe_idはnull)", async () => {
    responseQueues.meal_plans = [
      {
        data: {
          id: "mp1",
          user_id: "user-1",
          planned_date: "2026-08-12",
          recipe_id: null,
          note: "外食予定",
          executed_at: null,
          created_at: "",
          updated_at: "",
        },
        error: null,
      },
    ];

    await upsertMealPlan({ planned_date: "2026-08-12", note: "外食予定" });

    const upsertCall = callLog.find((c) => c.table === "meal_plans" && c.method === "upsert");
    expect(upsertCall?.args[0]).toEqual({
      user_id: "user-1",
      planned_date: "2026-08-12",
      recipe_id: null,
      note: "外食予定",
      executed_at: null,
    });
  });
});

describe("shortageToShoppingItemInput", () => {
  test("不足アイテムを買い物リスト入力に変換する", () => {
    const shortage: RecipeShortage = {
      item_id: "item-1",
      item_name: "卵",
      required: 3,
      available: 1,
      unit: "個",
    };
    expect(shortageToShoppingItemInput(shortage)).toEqual({
      name: "卵",
      linked_item_id: "item-1",
      desired_units: 1,
    });
  });
});

describe("executeMealPlan", () => {
  const makeRecipe = (): RecipeWithItems => ({
    id: "recipe-1",
    user_id: "user-1",
    name: "朝のコーヒー",
    created_at: "",
    updated_at: "",
    items: [{ id: "ri-1", recipe_id: "recipe-1", item_id: "item-1", amount: 1, created_at: "" }],
  });
  const itemsById = {
    "item-1": {
      id: "item-1",
      user_id: "user-1",
      name: "コーヒー豆",
      units: 3,
      content_amount: 1,
      content_unit: "個",
      opened_remaining: null,
    },
  };

  test("消費に成功した場合、既存executeRecipeへ委譲した上でmeal_plans.executed_atを更新する", async () => {
    const { executeMealPlan } = await import("@/hooks/useMealPlans");
    responseQueues.item_lots = [
      { data: [], error: null }, // pre-check FEFO fetch
      { data: [], error: null }, // item-1's consumeItem fetch
    ];
    responseQueues.items = [
      { data: null, error: null }, // items update (no-lots fallback path)
      { data: { auto_reorder: false }, error: null }, // maybeAutoReorder's own select
      { data: { ...itemsById["item-1"], units: 2 }, error: null }, // consumeItem's final re-select
    ];
    responseQueues.consumption_logs = [{ data: null, error: null }];
    responseQueues.meal_plans = [{ data: null, error: null }];

    const result = await executeMealPlan({
      mealPlanId: "mp-1",
      recipe: makeRecipe(),
      itemsById,
    });

    expect(result.status).toBe("executed");
    expect(result.consumedItemIds).toEqual(["item-1"]);
    const updateCall = callLog.find((c) => c.table === "meal_plans" && c.method === "update");
    expect(updateCall).toBeDefined();
    const updatePayload = updateCall?.args[0] as { executed_at: string } | undefined;
    expect(typeof updatePayload?.executed_at).toBe("string");
    const eqCall = callLog.find(
      (c) => c.table === "meal_plans" && c.method === "eq" && c.args[0] === "id",
    );
    expect(eqCall?.args).toEqual(["id", "mp-1"]);
  });

  test("在庫不足でblockedの場合、meal_plansは更新しない", async () => {
    const { executeMealPlan } = await import("@/hooks/useMealPlans");
    responseQueues.item_lots = [{ data: [], error: null }]; // pre-check FEFO fetch only
    const shortItemsById = { "item-1": { ...itemsById["item-1"], units: 0 } };

    const result = await executeMealPlan({
      mealPlanId: "mp-1",
      recipe: makeRecipe(),
      itemsById: shortItemsById,
    });

    expect(result.status).toBe("blocked");
    expect(callLog.some((c) => c.table === "meal_plans")).toBe(false);
  });
});
