import assert from "node:assert/strict";
import { resolveHouseholdId } from "./household.ts";

Deno.test("resolveHouseholdId returns the household of the member", async () => {
  const id = await resolveHouseholdId(
    async (userId) => ({ data: { household_id: `household-of-${userId}` }, error: null }),
    "user-1",
  );
  assert.equal(id, "household-of-user-1");
});

Deno.test("resolveHouseholdId returns null when the user has no membership", async () => {
  const id = await resolveHouseholdId(async () => ({ data: null, error: null }), "user-1");
  assert.equal(id, null);
});

Deno.test("resolveHouseholdId returns null (no user_id fallback) on lookup errors", async () => {
  assert.equal(
    await resolveHouseholdId(async () => ({ data: null, error: new Error("boom") }), "user-1"),
    null,
  );
  assert.equal(
    await resolveHouseholdId(async () => {
      throw new Error("network");
    }, "user-1"),
    null,
  );
});
