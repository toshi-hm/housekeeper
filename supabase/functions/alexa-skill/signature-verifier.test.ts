import { assertStrictEquals } from "jsr:@std/assert";
import { dnsMatches } from "./signature-verifier.ts";

// dnsMatches — pure function tests (no I/O, no mocking needed)

Deno.test("dnsMatches - exact match", () => {
  assertStrictEquals(dnsMatches("echo-api.amazon.com", "echo-api.amazon.com"), true);
});

Deno.test("dnsMatches - case insensitive", () => {
  assertStrictEquals(dnsMatches("Echo-Api.Amazon.Com", "echo-api.amazon.com"), true);
});

Deno.test("dnsMatches - no match", () => {
  assertStrictEquals(dnsMatches("other.amazon.com", "echo-api.amazon.com"), false);
});

Deno.test("dnsMatches - wildcard matches single label", () => {
  assertStrictEquals(dnsMatches("*.amazon.com", "echo-api.amazon.com"), true);
});

Deno.test("dnsMatches - wildcard does not match multi-label", () => {
  assertStrictEquals(dnsMatches("*.amazon.com", "a.b.amazon.com"), false);
});

Deno.test("dnsMatches - wildcard does not match bare domain", () => {
  assertStrictEquals(dnsMatches("*.amazon.com", "amazon.com"), false);
});

Deno.test("dnsMatches - wildcard suffix mismatch", () => {
  assertStrictEquals(dnsMatches("*.example.com", "echo-api.amazon.com"), false);
});

Deno.test("dnsMatches - empty strings do not match", () => {
  assertStrictEquals(dnsMatches("", "echo-api.amazon.com"), false);
});

Deno.test("dnsMatches - target is subdomain of wildcard suffix", () => {
  assertStrictEquals(dnsMatches("*.amazon.com", "api.amazon.com"), true);
});
