import assert from "node:assert/strict";
import { summarizeResults } from "./result.ts";

const fulfilled = (): PromiseFulfilledResult<void> => ({ status: "fulfilled", value: undefined });
const rejected = (reason: unknown = new Error("failed")): PromiseRejectedResult => ({
  status: "rejected",
  reason,
});

Deno.test("summarizeResults - all succeeded", () => {
  const summary = summarizeResults([fulfilled(), fulfilled()]);
  assert.deepStrictEqual(summary, { sent: 2, failed: 0, allFailed: false });
});

Deno.test("summarizeResults - all failed", () => {
  const summary = summarizeResults([rejected(), rejected()]);
  assert.deepStrictEqual(summary, { sent: 0, failed: 2, allFailed: true });
});

Deno.test("summarizeResults - partial failure is not allFailed", () => {
  const summary = summarizeResults([fulfilled(), rejected()]);
  assert.deepStrictEqual(summary, { sent: 1, failed: 1, allFailed: false });
});

Deno.test("summarizeResults - empty results is not allFailed", () => {
  const summary = summarizeResults([]);
  assert.deepStrictEqual(summary, { sent: 0, failed: 0, allFailed: false });
});
