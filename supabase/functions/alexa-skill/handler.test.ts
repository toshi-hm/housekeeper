import assert from "node:assert/strict";

import { handler } from "./index.ts";

Deno.test("alexa-skill handler - responds to preflight", async () => {
  const response = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assert.strictEqual(response.status, 204);
});

Deno.test("alexa-skill handler - rejects unsupported methods", async () => {
  const response = await handler(new Request("https://example.test", { method: "GET" }));
  assert.strictEqual(response.status, 405);
});

Deno.test("alexa-skill handler - rejects requests missing Alexa security headers", async () => {
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  );
  assert.strictEqual(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.strictEqual(body.error, "Missing Alexa security headers");
});

Deno.test("alexa-skill handler - rejects an invalid SignatureCertChainUrl", async () => {
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      headers: {
        Signature: "dummy-signature",
        SignatureCertChainUrl: "https://evil.example.com/echo.api/cert.pem",
      },
      body: JSON.stringify({}),
    }),
  );
  assert.strictEqual(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.strictEqual(body.error, "Invalid SignatureCertChainUrl");
});
