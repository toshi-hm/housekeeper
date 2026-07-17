// Alexa request signature verification
// https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html
//
// Per Amazon's spec, verification requires walking the full certificate
// chain presented by SignatureCertChainUrl up to a certificate issued by a
// trusted root CA — not merely checking date/SAN/signature on the leaf cert
// in isolation (see #492). We use Node's `node:crypto` X509Certificate API
// (available in Deno via the node: compat layer) to do proper chain
// validation: each certificate in the chain must be issued by, and its
// signature verified against, the next certificate up, terminating at one
// of our pinned trusted root CAs.

import { X509Certificate } from "node:crypto";

// --- Pinned trusted root CAs ---
//
// These are the root CAs Amazon has used (historically and currently) to
// issue certificates for echo-api.amazon.com: the legacy Starfield root
// (Starfield Services Root Certificate Authority - G2) and the current
// Amazon Trust Services root (Amazon Root CA 1). Sourced verbatim from the
// Mozilla-maintained CA bundle distributed via the `certifi` project
// (https://github.com/certifi/python-certifi), which tracks Mozilla's
// canonical root store.
export const TRUSTED_ROOT_PEMS = [
  // Starfield Services Root Certificate Authority - G2
  // SHA256 fingerprint: 56:8D:69:05:A2:C8:87:08:A4:B3:02:51:90:ED:CF:ED:B1:97:4A:60:6A:13:C6:E5:29:0F:CB:2A:E6:3E:DA:B5
  `-----BEGIN CERTIFICATE-----
MIID7zCCAtegAwIBAgIBADANBgkqhkiG9w0BAQsFADCBmDELMAkGA1UEBhMCVVMx
EDAOBgNVBAgTB0FyaXpvbmExEzARBgNVBAcTClNjb3R0c2RhbGUxJTAjBgNVBAoT
HFN0YXJmaWVsZCBUZWNobm9sb2dpZXMsIEluYy4xOzA5BgNVBAMTMlN0YXJmaWVs
ZCBTZXJ2aWNlcyBSb290IENlcnRpZmljYXRlIEF1dGhvcml0eSAtIEcyMB4XDTA5
MDkwMTAwMDAwMFoXDTM3MTIzMTIzNTk1OVowgZgxCzAJBgNVBAYTAlVTMRAwDgYD
VQQIEwdBcml6b25hMRMwEQYDVQQHEwpTY290dHNkYWxlMSUwIwYDVQQKExxTdGFy
ZmllbGQgVGVjaG5vbG9naWVzLCBJbmMuMTswOQYDVQQDEzJTdGFyZmllbGQgU2Vy
dmljZXMgUm9vdCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkgLSBHMjCCASIwDQYJKoZI
hvcNAQEBBQADggEPADCCAQoCggEBANUMOsQq+U7i9b4Zl1+OiFOxHz/Lz58gE20p
OsgPfTz3a3Y4Y9k2YKibXlwAgLIvWX/2h/klQ4bnaRtSmpDhcePYLQ1Ob/bISdm2
8xpWriu2dBTrz/sm4xq6HZYuajtYlIlHVv8loJNwU4PahHQUw2eeBGg6345AWh1K
Ts9DkTvnVtYAcMtS7nt9rjrnvDH5RfbCYM8TWQIrgMw0R9+53pBlbQLPLJGmpufe
hRhJfGZOozptqbXuNC66DQO4M99H67FrjSXZm86B0UVGMpZwh94CDklDhbZsc7tk
6mFBrMnUVN+HL8cisibMn1lUaJ/8viovxFUcdUBgF4UCVTmLfwUCAwEAAaNCMEAw
DwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFJxfAN+q
AdcwKziIorhtSpzyEZGDMA0GCSqGSIb3DQEBCwUAA4IBAQBLNqaEd2ndOxmfZyMI
bw5hyf2E3F/YNoHN2BtBLZ9g3ccaaNnRbobhiCPPE95Dz+I0swSdHynVv/heyNXB
ve6SbzJ08pGCL72CQnqtKrcgfU28elUSwhXqvfdqlS5sdJ/PHLTyxQGjhdByPq1z
qwubdQxtRbeOlKyWN7Wg0I8VRw7j6IPdj/3vQQF3zCepYoUz8jcI73HPdwbeyBkd
iEDPfUYd/x7H4c7/I9vG+o1VTqkC50cRRj70/b17KSa7qWFiNyi2LSr2EIZkyXCn
0q23KXB56jzaYyWf/Wi3MOxw+3WKt21gZ7IeyLnp2KhvAotnDU0mV3HaIPzBSlCN
sSi6
-----END CERTIFICATE-----`,
  // Amazon Root CA 1
  // SHA256 fingerprint: 8E:CD:E6:88:4F:3D:87:B1:12:5B:A3:1A:C3:FC:B1:3D:70:16:DE:7F:57:CC:90:4F:E1:CB:97:C6:AE:98:19:6E
  `-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6
b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv
b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj
ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM
9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw
IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6
VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L
93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm
jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC
AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA
A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI
U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs
N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv
o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU
5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy
rqXRfboQnoZsG4q5WTP468SQvvG5
-----END CERTIFICATE-----`,
];

let trustedRootsCache: X509Certificate[] | null = null;
const getTrustedRoots = (): X509Certificate[] => {
  trustedRootsCache ??= TRUSTED_ROOT_PEMS.map((pem) => new X509Certificate(pem));
  return trustedRootsCache;
};

// --- Chain parsing & validation ---

const PEM_CERT_REGEX = /-----BEGIN CERTIFICATE-----[^-]+-----END CERTIFICATE-----/g;

export const parseCertChain = (pemText: string): X509Certificate[] => {
  const matches = pemText.match(PEM_CERT_REGEX) ?? [];
  return matches.map((pem) => new X509Certificate(pem));
};

const TARGET_HOST = "echo-api.amazon.com";

const isValidNow = (cert: X509Certificate, now: Date): boolean =>
  new Date(cert.validFrom) <= now && now <= new Date(cert.validTo);

// Validates the full certificate chain per Amazon's signature verification spec:
//   1. The leaf certificate is currently valid and its SAN covers echo-api.amazon.com.
//   2. Every certificate in the chain is currently valid, was issued by the
//      next certificate up, and its signature verifies against that issuer's
//      public key.
//   3. The chain terminates at (or below) one of our pinned trusted root CAs.
// Returns the earliest `validTo` across the whole chain on success (used for
// cache expiry), or null if the chain fails validation.
export const validateCertChain = (chain: X509Certificate[]): number | null => {
  if (chain.length === 0) return null;
  const now = new Date();

  const leaf = chain[0];
  if (!isValidNow(leaf, now)) return null;
  if (leaf.checkHost(TARGET_HOST) == null) return null;

  let minNotAfter = new Date(leaf.validTo).getTime();

  for (let i = 0; i < chain.length - 1; i++) {
    const child = chain[i];
    const issuer = chain[i + 1];
    if (!isValidNow(issuer, now)) return null;
    if (!child.checkIssued(issuer)) return null;
    if (!child.verify(issuer.publicKey)) return null;
    minNotAfter = Math.min(minNotAfter, new Date(issuer.validTo).getTime());
  }

  const last = chain[chain.length - 1];
  const trustedRoots = getTrustedRoots();
  const chainsToTrustedRoot = trustedRoots.some((root) => {
    if (last.fingerprint256 === root.fingerprint256) return true; // last cert IS a pinned root
    return last.checkIssued(root) && last.verify(root.publicKey); // last cert is signed by a pinned root
  });
  if (!chainsToTrustedRoot) return null;

  return minNotAfter;
};

// ---

// Module-level cache: Alexa rotates certs infrequently; caching avoids per-request S3 fetches.
// notAfterMs (earliest expiry across the validated chain) is re-checked on every
// hit so an expired cached chain is never accepted.
let certCache: { url: string; spki: Uint8Array; notAfterMs: number } | null = null;

export const verifyAlexaSignature = async (
  rawBody: Uint8Array,
  signatureB64: string,
  certChainUrl: string,
): Promise<boolean> => {
  try {
    let spki: Uint8Array;

    if (certCache?.url === certChainUrl && Date.now() <= certCache.notAfterMs) {
      spki = certCache.spki;
    } else {
      const controller = new AbortController();
      // 3s for cert fetch — S3 is fast; keeps budget for Gemini on cold start
      const timeout = setTimeout(() => controller.abort(), 3000);
      let certRes: Response;
      try {
        // redirect:"follow" allows S3 regional redirects (s3.amazonaws.com → s3.us-east-1.amazonaws.com)
        certRes = await fetch(certChainUrl, { signal: controller.signal, redirect: "follow" });
      } catch (fetchErr) {
        clearTimeout(timeout);
        console.error("[alexa-skill] Cert fetch failed:", fetchErr);
        return false;
      }
      if (!certRes.ok) {
        clearTimeout(timeout);
        console.error("[alexa-skill] Cert fetch HTTP error:", certRes.status);
        return false;
      }

      // Keep timeout active during body read — slow transfers can still be aborted
      const pem = await certRes.text();
      clearTimeout(timeout);

      let chain: X509Certificate[];
      try {
        chain = parseCertChain(pem);
      } catch (parseErr) {
        console.error("[alexa-skill] Failed to parse certificate chain:", parseErr);
        return false;
      }
      if (chain.length === 0) {
        console.error("[alexa-skill] No certificates found in PEM response");
        return false;
      }

      const notAfterMs = validateCertChain(chain);
      if (notAfterMs === null) {
        console.error(
          "[alexa-skill] Certificate chain failed validation (expired, wrong domain, broken chain, or untrusted root)",
        );
        return false;
      }

      // Export the leaf's SubjectPublicKeyInfo (DER) for the actual request-body
      // signature check below.
      spki = new Uint8Array(chain[0].publicKey.export({ type: "spki", format: "der" }));
      certCache = { url: certChainUrl, spki, notAfterMs };
    }

    // Alexa signs request bodies with RSA + SHA-1 (SHA1withRSA), not SHA-256
    const publicKey = await crypto.subtle.importKey(
      "spki",
      spki,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
      false,
      ["verify"],
    );

    const signature = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, rawBody);
    if (!valid) {
      console.error(
        "[alexa-skill] RSA-SHA1 verify failed, body:",
        rawBody.length,
        "sig:",
        signature.length,
      );
    }
    return valid;
  } catch (err) {
    console.error("[alexa-skill] Signature verification error:", err);
    return false;
  }
};
