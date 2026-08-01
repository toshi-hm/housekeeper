import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { isValidBarcode } from "./validation.ts";
import { fetchYahooShoppingProduct } from "./yahoo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
    const { barcode } = (await req.json()) as { barcode: string };

    if (!barcode) {
      return new Response(JSON.stringify({ product: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidBarcode(barcode)) {
      // #655: distinct error code from "product not found" (which is a
      // 200 response with product: null) so the client doesn't conflate a
      // malformed request with a genuine catalog miss.
      return new Response(JSON.stringify({ error: "invalid_barcode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appId = Deno.env.get("YAHOO_SHOPPING_APP_ID");
    if (!appId) {
      console.error("YAHOO_SHOPPING_APP_ID is not set");
      return new Response(JSON.stringify({ error: "missing_api_config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await fetchYahooShoppingProduct({ appId, barcode });

    if (result.kind === "timeout") {
      // #709: the external API used to be able to hang forever with no
      // timeout guard, so the client's lookup spinner never resolved. Mirror
      // the 504 `timeout` shape already used by inventory-chat/recipe-suggest
      // so the client can surface a distinct, actionable error.
      return new Response(JSON.stringify({ error: "timeout" }), {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result.kind === "error") {
      // #655: an upstream Yahoo Shopping API failure is a server-side
      // problem, not "no such product" — surface it as an error instead of
      // a silent 200 with product: null, which the client used to
      // indistinguishably render as "商品が見つかりません".
      return new Response(JSON.stringify({ error: "upstream_error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ product: result.product }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
