import assert from "node:assert/strict";
import { dnsMatches } from "./signature-verifier.ts";

// dnsMatches — pure function tests (no I/O, no mocking needed)

Deno.test("dnsMatches - exact match", () => {
  assert.strictEqual(dnsMatches("echo-api.amazon.com", "echo-api.amazon.com"), true);
});

Deno.test("dnsMatches - case insensitive", () => {
  assert.strictEqual(dnsMatches("Echo-Api.Amazon.Com", "echo-api.amazon.com"), true);
});

Deno.test("dnsMatches - no match", () => {
  assert.strictEqual(dnsMatches("other.amazon.com", "echo-api.amazon.com"), false);
});

Deno.test("dnsMatches - wildcard matches single label", () => {
  assert.strictEqual(dnsMatches("*.amazon.com", "echo-api.amazon.com"), true);
});

Deno.test("dnsMatches - wildcard does not match multi-label", () => {
  assert.strictEqual(dnsMatches("*.amazon.com", "a.b.amazon.com"), false);
});

Deno.test("dnsMatches - wildcard does not match bare domain", () => {
  assert.strictEqual(dnsMatches("*.amazon.com", "amazon.com"), false);
});

Deno.test("dnsMatches - wildcard suffix mismatch", () => {
  assert.strictEqual(dnsMatches("*.example.com", "echo-api.amazon.com"), false);
});

Deno.test("dnsMatches - empty strings do not match", () => {
  assert.strictEqual(dnsMatches("", "echo-api.amazon.com"), false);
});

Deno.test("dnsMatches - target is subdomain of wildcard suffix", () => {
  assert.strictEqual(dnsMatches("*.amazon.com", "api.amazon.com"), true);
});
