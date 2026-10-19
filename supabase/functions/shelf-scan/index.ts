import { checkShelfScanRateLimit } from "../_shared/rate-limit.ts";
import { queryGeminiShelfScan } from "./gemini.ts";
import type { ShelfScanRequest, ShelfScanResponse } from "./types.ts";
import { isValidImagePayload, isValidMimeType } from "./validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Lazy dynamic import (not a static top-level import) so importing this
  // module in tests doesn't require network access to esm.sh.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let parsed: ShelfScanRequest;
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Invalid JSON body" }, 400);
    }
    parsed = body as ShelfScanRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!isValidMimeType(parsed.mimeType)) {
    return json({ error: "unsupported_mime_type" }, 400);
  }
  if (!isValidImagePayload(parsed.image)) {
    return json({ error: "image_too_large" }, 413);
  }

  // Consume quota only for well-formed requests so invalid bodies are free.
  const rateLimit = await checkShelfScanRateLimit(supabase);
  if (!rateLimit.allowed) {
    return json({ error: "rate_limited" }, 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  const result = await queryGeminiShelfScan(parsed.image, parsed.mimeType);
  if (result.kind === "timeout") {
    return json({ error: "timeout" }, 504);
  }
  if (result.kind === "error") {
    return json({ error: "ai_error" }, 502);
  }

  const response: ShelfScanResponse = result.data;
  return json(response);
};

if (import.meta.main) Deno.serve(handler);
