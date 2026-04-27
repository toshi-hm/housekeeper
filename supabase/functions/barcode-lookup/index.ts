const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OpenFoodFactsResponse {
  status: string;
  product?: {
    product_name?: string;
    categories_tags?: string[];
    image_url?: string;
  };
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

    const res = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json`,
    );

    if (!res.ok) {
      return new Response(JSON.stringify({ product: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = (await res.json()) as OpenFoodFactsResponse;

    if (json.status !== "success" || !json.product) {
      return new Response(JSON.stringify({ product: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const product = json.product;
    const category = product.categories_tags?.[0]?.replace(/^en:/, "") ?? null;

    return new Response(
      JSON.stringify({
        product: {
          name: product.product_name ?? "",
          category,
          image_url: product.image_url ?? null,
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
