#!/usr/bin/env bun
// Nightly contract-drift monitor for the free/quasi-free external APIs the
// app depends on (#544):
//   - Yahoo!ショッピング商品検索API (used by supabase/functions/barcode-lookup)
//   - Gemini API (used by supabase/functions/inventory-chat and alexa-skill)
//
// These are vendor-managed free/near-free APIs whose response shape, field
// availability, or rate-limit behavior can change without notice. Existing
// tests (validation.test.ts, chat.test.ts) only assert parsing against
// mocked fixtures — they never notice if the *live* API has drifted. This
// script sends one minimal real request to each API and validates the
// response with Zod, so a shape change, 429, or 5xx becomes a visible
// failure instead of a silent surprise in production.
//
// Run via `.github/workflows/api-contract-monitor.yml` on a daily schedule.
//
// Run locally:
//   YAHOO_SHOPPING_APP_ID=... GEMINI_API_KEY=... bun run api-contract-monitor
//
// If a key is missing (e.g. a fork with no secrets configured), that single
// check is skipped with a clear message instead of crashing. If *all* keys
// are missing, the whole run exits 0 (nothing to verify) rather than
// failing loudly for an expectedly-unconfigured environment.

import { z } from "zod";

import { chatResponseSchema } from "../src/types/chat";

type CheckStatus = "ok" | "skipped" | "failed";

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

const REQUEST_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

// ---------------------------------------------------------------------------
// Yahoo!ショッピング商品検索API
// ---------------------------------------------------------------------------

// Mirrors the (module-local, non-Zod) `YahooShoppingHit` / `YahooShoppingResponse`
// interfaces declared in supabase/functions/barcode-lookup/index.ts. Kept as
// a separate Zod schema here — rather than importing that file — because it
// pulls in a Deno-only remote import (`https://esm.sh/@supabase/supabase-js`)
// that bun/node cannot resolve outside the Supabase Edge Function runtime.
const yahooShoppingHitSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  image: z.object({ medium: z.string().optional() }).optional(),
  brand: z.object({ name: z.string().optional() }).optional(),
});

const yahooShoppingResponseSchema = z.object({
  totalResultsReturned: z.number().optional(),
  hits: z.array(yahooShoppingHitSchema).optional(),
});

const checkYahooShoppingApi = async (): Promise<CheckResult> => {
  const name = "Yahoo!ショッピング商品検索API";
  const appId = process.env.YAHOO_SHOPPING_APP_ID;
  if (!appId) {
    return { name, status: "skipped", detail: "YAHOO_SHOPPING_APP_ID is not set; skipping." };
  }

  const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
  url.searchParams.set("appid", appId);
  // A generic, evergreen keyword (rather than a single JAN code, which the
  // production `barcode-lookup` call uses) so this reliably returns at
  // least one hit and exercises the nested `hits[].image` / `hits[].brand`
  // fields too, not just an empty envelope.
  url.searchParams.set("query", "ミネラルウォーター");
  url.searchParams.set("results", "1");

  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString());
  } catch (err) {
    return { name, status: "failed", detail: `Request failed: ${String(err)}` };
  }

  if (res.status === 429) {
    return { name, status: "failed", detail: "Rate limited (HTTP 429)." };
  }
  if (res.status >= 500) {
    return { name, status: "failed", detail: `Upstream server error (HTTP ${res.status}).` };
  }
  if (!res.ok) {
    return { name, status: "failed", detail: `Unexpected HTTP status ${res.status}.` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    return { name, status: "failed", detail: `Response was not valid JSON: ${String(err)}` };
  }

  const parsed = yahooShoppingResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { name, status: "failed", detail: `Response shape mismatch: ${parsed.error.message}` };
  }

  const hitCount = parsed.data.hits?.length ?? 0;
  return { name, status: "ok", detail: `OK (HTTP ${res.status}, ${hitCount} hit(s)).` };
};

// ---------------------------------------------------------------------------
// Gemini API
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-2.5-flash";

// The Gemini `generateContent` HTTP envelope. No existing Zod schema covers
// this — supabase/functions/inventory-chat/types.ts only has a plain TS
// `GeminiResponse` interface — so it's declared fresh here.
const geminiEnvelopeSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const checkGeminiApi = async (): Promise<CheckResult> => {
  const name = "Gemini API (gemini-2.5-flash)";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { name, status: "skipped", detail: "GEMINI_API_KEY is not set; skipping." };
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  // Mirrors the request shape built by
  // supabase/functions/inventory-chat/gemini.ts#buildGeminiRequestBody, with
  // a trivial fixed prompt/context. This checks "does the API still accept
  // this request and return this shape", not chat quality.
  const body = {
    contents: [
      { role: "user", parts: [{ text: "在庫は空です。テスト用の一言挨拶だけ返してください。" }] },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          reply: { type: "string" },
          items: { type: "array", items: { type: "object" } },
        },
        required: ["reply", "items"],
      },
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { name, status: "failed", detail: `Request failed: ${String(err)}` };
  }

  if (res.status === 429) {
    return { name, status: "failed", detail: "Rate limited / quota exceeded (HTTP 429)." };
  }
  if (res.status >= 500) {
    return { name, status: "failed", detail: `Upstream server error (HTTP ${res.status}).` };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return {
      name,
      status: "failed",
      detail: `Unexpected HTTP status ${res.status}. ${errText.slice(0, 200)}`,
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    return { name, status: "failed", detail: `Response was not valid JSON: ${String(err)}` };
  }

  const envelope = geminiEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    return {
      name,
      status: "failed",
      detail: `Envelope shape mismatch: ${envelope.error.message}`,
    };
  }

  const text = envelope.data.candidates?.[0]?.content?.parts?.find((p) => !p.thought)?.text;
  if (!text) {
    return { name, status: "failed", detail: "No text part found in Gemini response." };
  }

  let structured: unknown;
  try {
    structured = JSON.parse(text);
  } catch (err) {
    return {
      name,
      status: "failed",
      detail: `Structured output was not valid JSON: ${String(err)}`,
    };
  }

  // Reuse the same Zod schema the web client uses to validate the
  // `inventory-chat` Edge Function's response (src/types/chat.ts) — Gemini's
  // structured output contract (`{ reply, items }`) is identical, since
  // inventory-chat forwards it to the client mostly as-is.
  const structuredParsed = chatResponseSchema.safeParse(structured);
  if (!structuredParsed.success) {
    return {
      name,
      status: "failed",
      detail: `Structured output shape mismatch: ${structuredParsed.error.message}`,
    };
  }

  return { name, status: "ok", detail: `OK (HTTP ${res.status}).` };
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const run = async (): Promise<void> => {
  const results = await Promise.all([checkYahooShoppingApi(), checkGeminiApi()]);

  console.log("=== External API contract monitor (#544) ===");
  for (const r of results) {
    const icon = r.status === "ok" ? "✅" : r.status === "skipped" ? "⚠️" : "❌";
    console.log(`${icon} [${r.status.toUpperCase()}] ${r.name}: ${r.detail}`);
  }

  const failed = results.filter((r) => r.status === "failed");
  const skipped = results.filter((r) => r.status === "skipped");

  if (skipped.length === results.length) {
    console.log("\nNo API keys were configured; nothing was verified. Exiting 0.");
    process.exit(0);
  }

  if (failed.length > 0) {
    console.error(
      `\n${failed.length} of ${results.length} check(s) failed. This likely means an external API contract changed — see docs/specs/features/barcode.md / inventory-chat.md.`,
    );
    process.exit(1);
  }

  console.log("\nAll configured checks passed.");
  process.exit(0);
};

if (import.meta.main) {
  await run();
}
