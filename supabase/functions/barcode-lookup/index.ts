const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface YahooShoppingHit {
  name?: string;
  description?: string;
  image?: { medium?: string };
  brand?: { name?: string };
}

interface YahooShoppingResponse {
  totalResultsReturned?: number;
  hits?: YahooShoppingHit[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { barcode } = (await req.json()) as { barcode: string };

    if (!barcode) {
      return new Response(JSON.stringify({ product: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appId = Deno.env.get("YAHOO_SHOPPING_APP_ID");
    if (!appId) {
      console.error("YAHOO_SHOPPING_APP_ID is not set");
      return new Response(JSON.stringify({ product: null }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
    url.searchParams.set("appid", appId);
    url.searchParams.set("jan_code", barcode);
    url.searchParams.set("results", "1");

    const res = await fetch(url.toString());

    if (!res.ok) {
      return new Response(JSON.stringify({ product: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = (await res.json()) as YahooShoppingResponse;

    if (!json.hits || json.hits.length === 0) {
      return new Response(JSON.stringify({ product: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hit = json.hits[0];

    return new Response(
      JSON.stringify({
        product: {
          name: hit.name ?? "",
          description: hit.description ?? null,
          image_url: hit.image?.medium ?? null,
          brand: hit.brand?.name ?? null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ product: null }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
