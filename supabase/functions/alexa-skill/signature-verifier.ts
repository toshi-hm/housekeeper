// Alexa request signature verification
// https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-a-web-service.html

const readDERLen = (data: Uint8Array, pos: number): { len: number; end: number } => {
  if (data[pos] < 0x80) return { len: data[pos], end: pos + 1 };
  const n = data[pos] & 0x7f;
  let len = 0;
  for (let i = 0; i < n; i++) len = (len << 8) | data[pos + 1 + i];
  return { len, end: pos + 1 + n };
};

// Extract SubjectPublicKeyInfo from DER-encoded X.509 leaf certificate.
// Traverses: Certificate SEQUENCE > TBSCertificate SEQUENCE > subjectPublicKeyInfo SEQUENCE.
// Identifies SPKI by detecting the rsaEncryption OID (1.2.840.113549.1.1.1) inside.
const extractSPKI = (certDer: Uint8Array): Uint8Array | null => {
  try {
    const RSA_OID = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);

    if (certDer[0] !== 0x30) return null;
    const cert = readDERLen(certDer, 1);

    if (certDer[cert.end] !== 0x30) return null;
    const tbs = readDERLen(certDer, cert.end + 1);

    let pos = tbs.end;
    const tbsEnd = tbs.end + tbs.len;

    while (pos < tbsEnd) {
      const tag = certDer[pos];
      const field = readDERLen(certDer, pos + 1);
      const fieldEnd = field.end + field.len;

      // SubjectPublicKeyInfo: SEQUENCE whose value starts with another SEQUENCE (AlgorithmIdentifier)
      // Simple AlgorithmIdentifiers (e.g., signature field) start directly with OID (0x06), not SEQUENCE
      if (tag === 0x30 && certDer[field.end] === 0x30) {
        const algo = readDERLen(certDer, field.end + 1);
        if (certDer[algo.end] === 0x06) {
          const oid = readDERLen(certDer, algo.end + 1);
          const oidBytes = certDer.slice(oid.end, oid.end + oid.len);
          if (oidBytes.length === RSA_OID.length && oidBytes.every((b, i) => b === RSA_OID[i])) {
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

const PEM_CERT_REGEX = /-----BEGIN CERTIFICATE-----([^-]+)-----END CERTIFICATE-----/;

// Module-level cache: Alexa rotates certs infrequently; caching avoids per-request S3 fetches.
let certCache: { url: string; spki: Uint8Array } | null = null;

export const verifyAlexaSignature = async (
  rawBody: Uint8Array,
  signatureB64: string,
  certChainUrl: string,
): Promise<boolean> => {
  try {
    let spki: Uint8Array;

    if (certCache?.url === certChainUrl) {
      spki = certCache.spki;
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      let certRes: Response;
      try {
        certRes = await fetch(certChainUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!certRes.ok) {
        console.error("[alexa-skill] Failed to fetch cert chain:", certRes.status);
        return false;
      }

      const pem = await certRes.text();
      const pemMatch = PEM_CERT_REGEX.exec(pem);
      if (!pemMatch) {
        console.error("[alexa-skill] No certificate found in PEM response");
        return false;
      }

      const certDer = Uint8Array.from(atob(pemMatch[1].replace(/\s/g, "")), (c) =>
        c.charCodeAt(0),
      );
      const extracted = extractSPKI(certDer);
      if (!extracted) {
        console.error("[alexa-skill] Failed to extract SPKI from certificate");
        return false;
      }

      spki = extracted;
      certCache = { url: certChainUrl, spki };
    }

    const publicKey = await crypto.subtle.importKey(
      "spki",
      spki,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signature = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));

    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, rawBody);
  } catch (err) {
    console.error("[alexa-skill] Signature verification error:", err);
    return false;
  }
};
