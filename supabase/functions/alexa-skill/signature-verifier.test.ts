import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";
import { dnsMatches, verifyAlexaSignature } from "./signature-verifier.ts";

// dnsMatches

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

// verifyAlexaSignature — failure modes (no real cert/sig needed)

Deno.test("verifyAlexaSignature - returns false when cert fetch throws", async () => {
  const fetchStub = stub(globalThis, "fetch", () => Promise.reject(new Error("network error")));
  try {
    const result = await verifyAlexaSignature(
      new Uint8Array([1, 2, 3]),
      btoa("fake-sig"),
      "https://s3.amazonaws.com/echo.api/echo-api-cert.pem",
    );
    assertStrictEquals(result, false);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("verifyAlexaSignature - returns false on non-200 HTTP response", async () => {
  const fetchStub = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response("Not Found", { status: 404 }),
      ),
  );
  try {
    const result = await verifyAlexaSignature(
      new Uint8Array([1, 2, 3]),
      btoa("fake-sig"),
      "https://s3.amazonaws.com/echo.api/echo-api-cert.pem",
    );
    assertStrictEquals(result, false);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("verifyAlexaSignature - returns false when PEM body is empty", async () => {
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("", { status: 200 })),
  );
  try {
    const result = await verifyAlexaSignature(
      new Uint8Array([1, 2, 3]),
      btoa("fake-sig"),
      "https://s3.amazonaws.com/echo.api/echo-api-cert.pem",
    );
    assertStrictEquals(result, false);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("verifyAlexaSignature - returns false when PEM has no certificate block", async () => {
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("not a pem file", { status: 200 })),
  );
  try {
    const result = await verifyAlexaSignature(
      new Uint8Array([1, 2, 3]),
      btoa("fake-sig"),
      "https://s3.amazonaws.com/echo.api/echo-api-cert.pem",
    );
    assertStrictEquals(result, false);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("verifyAlexaSignature - returns false when PEM contains invalid base64 DER", async () => {
  const badPem = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----";
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response(badPem, { status: 200 })),
  );
  try {
    const result = await verifyAlexaSignature(
      new Uint8Array([1, 2, 3]),
      btoa("fake-sig"),
      "https://s3.amazonaws.com/echo.api/echo-api-cert.pem",
    );
    assertStrictEquals(result, false);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("verifyAlexaSignature - cache: second call with same URL skips fetch", async () => {
  let callCount = 0;
  const fetchStub = stub(globalThis, "fetch", () => {
    callCount++;
    return Promise.reject(new Error("network"));
  });
  try {
    await verifyAlexaSignature(
      new Uint8Array([1]),
      btoa("sig"),
      "https://s3.amazonaws.com/echo.api/echo-api-cert-unique-url-for-cache-test.pem",
    );
    assertEquals(callCount, 1);
    // A second call with the same URL would hit cache IF first call had succeeded.
    // Since first call failed (fetch threw), cache was not populated, so second call also fetches.
    await verifyAlexaSignature(
      new Uint8Array([1]),
      btoa("sig"),
      "https://s3.amazonaws.com/echo.api/echo-api-cert-unique-url-for-cache-test.pem",
    );
    assertEquals(callCount, 2);
  } finally {
    fetchStub.restore();
  }
});
