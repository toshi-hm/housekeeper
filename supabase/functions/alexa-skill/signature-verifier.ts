// Alexa request signature verification
// https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html

// --- DER parsing helpers ---

const readDERLen = (data: Uint8Array, pos: number): { len: number; end: number } => {
  if (data[pos] < 0x80) return { len: data[pos], end: pos + 1 };
  const n = data[pos] & 0x7f;
  let len = 0;
  for (let i = 0; i < n; i++) len = (len << 8) | data[pos + 1 + i];
  return { len, end: pos + 1 + n };
};

// rsaEncryption OID: 1.2.840.113549.1.1.1
const RSA_OID = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
// id-ce-subjectAltName OID: 2.5.29.17
const SAN_OID = new Uint8Array([0x55, 0x1d, 0x11]);

const oidEq = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// Navigate to TBSCertificate content bounds
const getTBSBounds = (certDer: Uint8Array): { start: number; end: number } | null => {
  if (certDer[0] !== 0x30) return null;
  const cert = readDERLen(certDer, 1);
  if (certDer[cert.end] !== 0x30) return null;
  const tbs = readDERLen(certDer, cert.end + 1);
  return { start: tbs.end, end: tbs.end + tbs.len };
};

// --- Certificate field extractors ---

// Extract SubjectPublicKeyInfo bytes (identified by rsaEncryption AlgorithmIdentifier inside)
const extractSPKI = (certDer: Uint8Array): Uint8Array | null => {
  try {
    const bounds = getTBSBounds(certDer);
    if (!bounds) return null;
    let pos = bounds.start;
    while (pos < bounds.end) {
      const tag = certDer[pos];
      const field = readDERLen(certDer, pos + 1);
      const fieldEnd = field.end + field.len;
      // SubjectPublicKeyInfo: SEQUENCE { SEQUENCE { OID rsaEncryption, ... }, BIT STRING }
      // Distinguishes from plain AlgorithmIdentifiers which start directly with OID (0x06)
      if (tag === 0x30 && certDer[field.end] === 0x30) {
        const algo = readDERLen(certDer, field.end + 1);
        if (certDer[algo.end] === 0x06) {
          const oid = readDERLen(certDer, algo.end + 1);
          if (oidEq(certDer.slice(oid.end, oid.end + oid.len), RSA_OID)) {
            return certDer.slice(pos, fieldEnd);
          }
        }
      }
      pos = fieldEnd;
    }
    return null;
  } catch {
    return null;
  }
};

// Parse UTCTime (0x17) or GeneralizedTime (0x18) from DER bytes; returns ms timestamp
const parseDERTime = (data: Uint8Array, pos: number, len: number, tag: number): number | null => {
  try {
    const s = new TextDecoder("ascii").decode(data.slice(pos, pos + len));
    if (tag === 0x17) {
      // UTCTime: YYMMDDHHMMSSZ — year 00-49 = 2000-2049, 50-99 = 1950-1999
      const yr = parseInt(s.slice(0, 2), 10);
      return new Date(
        `${yr >= 50 ? 1900 + yr : 2000 + yr}-${s.slice(2, 4)}-${s.slice(4, 6)}` +
          `T${s.slice(6, 8)}:${s.slice(8, 10)}:${s.slice(10, 12)}Z`,
      ).getTime();
    }
    if (tag === 0x18) {
      // GeneralizedTime: YYYYMMDDHHMMSSZ
      return new Date(
        `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` +
          `T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`,
      ).getTime();
    }
    return null;
  } catch {
    return null;
  }
};

// Validate notBefore <= now <= notAfter from the certificate Validity SEQUENCE.
// Returns the notAfter timestamp (ms) on success, or null if invalid/expired.
const validateCertDates = (certDer: Uint8Array): number | null => {
  try {
    const bounds = getTBSBounds(certDer);
    if (!bounds) return null;
    let pos = bounds.start;
    while (pos < bounds.end) {
      const tag = certDer[pos];
      const field = readDERLen(certDer, pos + 1);
      const fieldEnd = field.end + field.len;
      // Validity SEQUENCE: first inner element is UTCTime (0x17) or GeneralizedTime (0x18)
      if (tag === 0x30 && (certDer[field.end] === 0x17 || certDer[field.end] === 0x18)) {
        const nbTag = certDer[field.end];
        const nbLen = readDERLen(certDer, field.end + 1);
        const notBefore = parseDERTime(certDer, nbLen.end, nbLen.len, nbTag);
        const naPos = nbLen.end + nbLen.len;
        if (naPos < fieldEnd) {
          const naTag = certDer[naPos];
          const naLen = readDERLen(certDer, naPos + 1);
          const notAfter = parseDERTime(certDer, naLen.end, naLen.len, naTag);
          if (notBefore !== null && notAfter !== null) {
            const now = Date.now();
            if (now >= notBefore && now <= notAfter) {
              return notAfter;
            }
            return null;
          }
        }
      }
      pos = fieldEnd;
    }
    return null;
  } catch {
    return null;
  }
};

// Check dNSName against target, supporting a single leading wildcard (*.example.com).
// A wildcard matches exactly one additional label: *.example.com matches sub.example.com
// but NOT a.b.example.com (multi-label depth).
const dnsMatches = (name: string, target: string): boolean => {
  const n = name.toLowerCase();
  const t = target.toLowerCase();
  if (n === t) return true;
  if (n.startsWith("*.")) {
    const suffix = n.slice(1); // ".example.com"
    if (!t.endsWith(suffix)) return false;
    const label = t.slice(0, t.length - suffix.length);
    return label.length > 0 && !label.includes(".");
  }
  return false;
};

// Validate SubjectAltName extension contains a dNSName for echo-api.amazon.com
const validateCertDomain = (certDer: Uint8Array): boolean => {
  const TARGET = "echo-api.amazon.com";
  try {
    const bounds = getTBSBounds(certDer);
    if (!bounds) return false;
    let pos = bounds.start;
    while (pos < bounds.end) {
      const tag = certDer[pos];
      const field = readDERLen(certDer, pos + 1);
      const fieldEnd = field.end + field.len;

      // Extensions section: [3] EXPLICIT (tag 0xa3)
      if (tag === 0xa3) {
        if (certDer[field.end] !== 0x30) return false;
        const exts = readDERLen(certDer, field.end + 1);
        let extPos = exts.end;
        const extsEnd = exts.end + exts.len;

        while (extPos < extsEnd) {
          if (certDer[extPos] !== 0x30) break;
          const ext = readDERLen(certDer, extPos + 1);
          const extEnd = ext.end + ext.len;

          if (certDer[ext.end] === 0x06) {
            const oidLen = readDERLen(certDer, ext.end + 1);
            const oidBytes = certDer.slice(oidLen.end, oidLen.end + oidLen.len);

            if (oidEq(oidBytes, SAN_OID)) {
              // Skip optional critical BOOLEAN, then read OCTET STRING wrapper
              let valPos = oidLen.end + oidLen.len;
              if (certDer[valPos] === 0x01) {
                const bLen = readDERLen(certDer, valPos + 1);
                valPos = bLen.end + bLen.len;
              }
              if (certDer[valPos] !== 0x04) return false;
              const octet = readDERLen(certDer, valPos + 1);
              valPos = octet.end;

              // GeneralNames SEQUENCE
              if (certDer[valPos] !== 0x30) return false;
              const gn = readDERLen(certDer, valPos + 1);
              let gnPos = gn.end;
              const gnEnd = gn.end + gn.len;

              while (gnPos < gnEnd) {
                const gnTag = certDer[gnPos];
                const gnField = readDERLen(certDer, gnPos + 1);
                if (gnTag === 0x82) {
                  // dNSName [2] IMPLICIT IA5String
                  const name = new TextDecoder("ascii").decode(
                    certDer.slice(gnField.end, gnField.end + gnField.len),
                  );
                  if (dnsMatches(name, TARGET)) return true;
                }
                gnPos = gnField.end + gnField.len;
              }
              return false; // SAN found but no matching dNSName
            }
          }
          extPos = extEnd;
        }
        return false; // Extensions scanned, no SAN found
      }
      pos = fieldEnd;
    }
    return false;
  } catch {
    return false;
  }
};

// ---

const PEM_CERT_REGEX = /-----BEGIN CERTIFICATE-----([^-]+)-----END CERTIFICATE-----/;

// Module-level cache: Alexa rotates certs infrequently; caching avoids per-request S3 fetches.
// notAfterMs is re-checked on every hit so an expired cached cert is never accepted.
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
      // 8 s gives S3 room to respond even on slow edge-node routes
      const timeout = setTimeout(() => controller.abort(), 8000);
      let certRes: Response;
      try {
        // redirect:"follow" allows S3 regional redirects (s3.amazonaws.com → s3.us-east-1.amazonaws.com)
        certRes = await fetch(certChainUrl, { signal: controller.signal, redirect: "follow" });
        clearTimeout(timeout);
        console.log("[alexa-skill] Cert fetch OK, status:", certRes.status, "url:", certChainUrl);
      } catch (fetchErr) {
        clearTimeout(timeout);
        console.error("[alexa-skill] Cert fetch failed:", fetchErr);
        return false;
      }
      if (!certRes.ok) {
        console.error("[alexa-skill] Cert fetch HTTP error:", certRes.status);
        return false;
      }

      const pem = await certRes.text();
      const pemMatch = PEM_CERT_REGEX.exec(pem);
      if (!pemMatch) {
        console.error("[alexa-skill] No certificate found in PEM response");
        return false;
      }

      const certDer = Uint8Array.from(atob(pemMatch[1].replace(/\s/g, "")), (c) => c.charCodeAt(0));
      console.log("[alexa-skill] Cert DER parsed, length:", certDer.length);

      const notAfterMs = validateCertDates(certDer);
      if (notAfterMs === null) {
        console.error("[alexa-skill] Certificate is expired or not yet valid");
        return false;
      }
      console.log("[alexa-skill] Cert dates valid, notAfter:", new Date(notAfterMs).toISOString());

      if (!validateCertDomain(certDer)) {
        console.error("[alexa-skill] Certificate SAN does not include echo-api.amazon.com");
        return false;
      }
      console.log("[alexa-skill] Cert domain valid");

      const extracted = extractSPKI(certDer);
      if (!extracted) {
        console.error("[alexa-skill] Failed to extract SPKI from certificate");
        return false;
      }
      console.log("[alexa-skill] SPKI extracted, length:", extracted.length);

      spki = extracted;
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
    console.log("[alexa-skill] RSA-SHA1 verify:", valid, "body:", rawBody.length, "bytes, sig:", signature.length, "bytes");
    return valid;
  } catch (err) {
    console.error("[alexa-skill] Signature verification error:", err);
    return false;
  }
};
