import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { zonedNow } from "./date.ts";

Deno.test("zonedNow resolves date and hour in the user's timezone", () => {
  assertEquals(zonedNow("Asia/Tokyo", new Date("2026-01-01T23:30:00.000Z")), {
    hour: 8,
    date: "2026-01-02",
  });
});

Deno.test("zonedNow falls back to Asia/Tokyo for an invalid timezone", () => {
  assertEquals(zonedNow("not-a-timezone", new Date("2026-01-01T23:30:00.000Z")).hour, 8);
});
