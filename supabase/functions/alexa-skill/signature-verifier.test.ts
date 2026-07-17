import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";

import { parseCertChain, TRUSTED_ROOT_PEMS, validateCertChain } from "./signature-verifier.ts";

// parseCertChain / validateCertChain — pure(ish) chain-of-trust logic tests (#492).
// TRUSTED_ROOT_PEMS are real, currently-valid, self-signed root CA certs, which
// makes them convenient (if not perfectly representative) fixtures: they let us
// exercise DER parsing and issuer/signature checks without needing to mint a
// full synthetic leaf→intermediate→root chain.

Deno.test("parseCertChain - parses a single PEM certificate", () => {
  const chain = parseCertChain(TRUSTED_ROOT_PEMS[0]);
  assert.strictEqual(chain.length, 1);
  assert.ok(chain[0] instanceof X509Certificate);
});

Deno.test("parseCertChain - parses multiple concatenated PEM certificates", () => {
  const chain = parseCertChain(TRUSTED_ROOT_PEMS.join("\n"));
  assert.strictEqual(chain.length, TRUSTED_ROOT_PEMS.length);
});

Deno.test("parseCertChain - returns an empty array for non-PEM input", () => {
  assert.deepStrictEqual(parseCertChain("not a certificate"), []);
});

Deno.test("validateCertChain - returns null for an empty chain", () => {
  assert.strictEqual(validateCertChain([]), null);
});

Deno.test("validateCertChain - rejects a chain whose leaf does not cover echo-api.amazon.com", () => {
  // The pinned root CAs are not issued for echo-api.amazon.com, so using one
  // as the "leaf" must fail the hostname check regardless of trust anchor logic.
  const chain = parseCertChain(TRUSTED_ROOT_PEMS[0]);
  assert.strictEqual(validateCertChain(chain), null);
});

Deno.test("validateCertChain - rejects a chain that does not terminate at a trusted root", () => {
  // Two unrelated self-signed roots concatenated: chain[0] was not issued by
  // chain[1], and neither is a leaf for echo-api.amazon.com, so this must
  // fail both the hostname check and (independently) the issuer check.
  const [starfield, amazonRootCa1] = TRUSTED_ROOT_PEMS;
  const chain = parseCertChain(`${starfield}\n${amazonRootCa1}`);
  assert.strictEqual(validateCertChain(chain), null);
});
