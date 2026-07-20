import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  canInferContentTypeFromPath,
  getMatchedTypeFromHeader,
  inferContentTypeFromPath,
  isAllowedUrl,
  isAuthorized,
  MAX_SIZE_BYTES,
} from "./url-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url } = (await req.json()) as { url: string };
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAllowedUrl(parsed)) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(url);

    // Validate final URL after redirects to prevent redirect-based allowlist bypass
    const finalUrl = new URL(res.url);
    if (!isAllowedUrl(finalUrl)) {
      return new Response(JSON.stringify({ error: "Redirect to disallowed host" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch image" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate Content-Type before reading body
    const contentType = res.headers.get("Content-Type") ?? "";
    const matchedTypeFromHeader = getMatchedTypeFromHeader(contentType);
    const matchedType =
      matchedTypeFromHeader ??
      (canInferContentTypeFromPath(contentType)
        ? (inferContentTypeFromPath(finalUrl.pathname) ?? inferContentTypeFromPath(parsed.pathname))
        : null);
    if (!matchedType) {
      return new Response(JSON.stringify({ error: "Unsupported content type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reject early if Content-Length already exceeds limit
    const contentLength = Number(res.headers.get("Content-Length") ?? 0);
    if (contentLength > MAX_SIZE_BYTES) {
      return new Response(JSON.stringify({ error: "Image too large" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream body with a hard size cap to avoid memory exhaustion
    const reader = res.body?.getReader();
    if (!reader) {
      return new Response(JSON.stringify({ error: "Empty response body" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > MAX_SIZE_BYTES) {
        await reader.cancel();
        return new Response(JSON.stringify({ error: "Image too large" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      chunks.push(value);
    }

    const uint8 = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      uint8.set(chunk, offset);
      offset += chunk.length;
    }

    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    return new Response(JSON.stringify({ data: base64, contentType: matchedType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
