import assert from "node:assert/strict";
import { isAuthorizedCronRequest } from "./auth.ts";

const makeRequest = (headers: Record<string, string> = {}) =>
  new Request("https://example.com/send-expiry-notifications", { headers });

Deno.test("isAuthorizedCronRequest - matching secret is authorized", () => {
  const req = makeRequest({ "X-Cron-Secret": "s3cr3t" });
  assert.strictEqual(isAuthorizedCronRequest(req, "s3cr3t"), true);
});

Deno.test("isAuthorizedCronRequest - mismatched secret is rejected", () => {
  const req = makeRequest({ "X-Cron-Secret": "wrong" });
  assert.strictEqual(isAuthorizedCronRequest(req, "s3cr3t"), false);
});

Deno.test("isAuthorizedCronRequest - missing header is rejected", () => {
  const req = makeRequest();
  assert.strictEqual(isAuthorizedCronRequest(req, "s3cr3t"), false);
});

Deno.test("isAuthorizedCronRequest - unconfigured secret always rejects", () => {
  const req = makeRequest({ "X-Cron-Secret": "anything" });
  assert.strictEqual(isAuthorizedCronRequest(req, undefined), false);
});

Deno.test("isAuthorizedCronRequest - empty secret env does not authorize empty header", () => {
  const req = makeRequest({ "X-Cron-Secret": "" });
  assert.strictEqual(isAuthorizedCronRequest(req, ""), false);
});
