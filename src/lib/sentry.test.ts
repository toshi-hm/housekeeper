import { describe, expect, test } from "bun:test";

import { initSentry, isSentryEnabled, reportError, sanitizeSentryEvent } from "@/lib/sentry";

describe("sentry (#67)", () => {
  test("is disabled by default when VITE_SENTRY_DSN is not set (self-hosted, opt-in only)", () => {
    expect(isSentryEnabled).toBe(false);
  });

  test("initSentry() and reportError() are no-ops without a DSN", () => {
    expect(() => initSentry()).not.toThrow();
    expect(() => reportError(new Error("test"))).not.toThrow();
  });

  test("sanitizeSentryEvent keeps only messages, safe stack fields, and protocol metadata", () => {
    const sanitized = sanitizeSentryEvent({
      event_id: "event-1",
      timestamp: 123,
      platform: "javascript",
      level: "error",
      message: "render failed",
      environment: "secret-environment",
      release: "secret-release",
      request: { url: "https://example.test/items?token=secret", data: "secret-body" },
      user: { id: "secret-user", email: "secret@example.test" },
      contexts: { inventory: { value: "secret-stock" } },
      tags: { secret: "secret-tag" },
      extra: { componentStack: "secret-component-stack" },
      breadcrumbs: [{ message: "secret-breadcrumb" }],
      transaction: "secret-transaction",
      fingerprint: ["secret-fingerprint"],
      exception: {
        values: [
          {
            type: "TypeError",
            value: "bad render",
            module: "secret-module",
            mechanism: { type: "secret-mechanism", handled: false },
            stacktrace: {
              frames: [
                {
                  filename: "https://example.test/app.js?token=secret#fragment",
                  function: "render",
                  module: "app",
                  lineno: 10,
                  colno: 2,
                  in_app: true,
                  abs_path: "secret-path",
                  context_line: "secret-source",
                  pre_context: ["secret-before"],
                  post_context: ["secret-after"],
                  vars: { inventory: "secret-vars" },
                },
              ],
            },
          },
        ],
      },
    });

    expect(sanitized).toEqual({
      event_id: "event-1",
      timestamp: 123,
      platform: "javascript",
      level: "error",
      message: "render failed",
      exception: {
        values: [
          {
            type: "TypeError",
            value: "bad render",
            stacktrace: {
              frames: [
                {
                  filename: "https://example.test/app.js",
                  function: "render",
                  module: "app",
                  lineno: 10,
                  colno: 2,
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain("secret");
  });

  test("sanitizeSentryEvent handles message-only events", () => {
    expect(sanitizeSentryEvent({ message: "plain failure" })).toEqual({
      message: "plain failure",
    });
  });
});
