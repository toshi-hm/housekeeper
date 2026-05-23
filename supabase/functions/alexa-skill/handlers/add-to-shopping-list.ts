import { createClient } from "jsr:@supabase/supabase-js@2";
import type { AlexaResponse, GeminiMatchResult, SessionAttributes } from "../types.ts";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "../response.ts";
import { fetchAllItems, formatTotalRemaining } from "../inventory.ts";
import { buildAddToShoppingListPrompt, queryGemini } from "../gemini.ts";

const addToShoppingList = async (name: string, linkedItemId: string | null): Promise<boolean> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userId = Deno.env.get("USER_ID");
  if (!supabaseUrl || !supabaseServiceKey || !userId) {
    console.error("[shopping-list] Missing required environment variables");
    return false;
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { error } = await supabase.from("shopping_list_items").insert({
    user_id: userId,
    name,
    desired_units: 1,
    status: "planned",
    linked_item_id: linkedItemId,
  });
  if (error) {
    console.error("[shopping-list] insert error:", error);
    return false;
  }
  return true;
};

const buildConfirmSpeech = (
  result: GeminiMatchResult,
  query: string,
): { speech: string; pendingAction: "add_to_shopping_list" | "choose_alternate" } => {
  const item = result.matchedItems[0];
  if (!item) {
    return {
      speech: `${query}を買い物リストに追加しますか？`,
      pendingAction: "add_to_shopping_list",
    };
  }

  const remaining = formatTotalRemaining({
    units: item.units,
    content_amount: item.content_amount,
    content_unit: item.content_unit,
    opened_remaining: item.opened_remaining ?? null,
    id: item.id,
    name: item.name,
    category_id: null,
    storage_location_id: null,
    expiry_date: item.expiry_date ?? null,
    deleted_at: null,
    categories: null,
    storage_locations: null,
  });

  if (result.stockStatus === "out_of_stock") {
    return {
      speech: `${item.name}は在庫切れですが、買い物リストに追加しますか？`,
      pendingAction: "add_to_shopping_list",
    };
  }

  if (result.matchedItems.length > 1) {
    return {
      speech: `自宅に${item.name}は${remaining}ありますが、同じ商品を追加しますか？`,
      pendingAction: "choose_alternate",
    };
  }

  return {
    speech: `すでに自宅に${item.name}は${remaining}ありますが、買い物リストに追加してよいですか？`,
    pendingAction: "add_to_shopping_list",
  };
};

export const handleAddToShoppingList = async (
  query: string,
  sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  if (!query) {
    return buildAskResponse(
      "何を買い物リストに追加しますか？商品名を教えてください。",
      "追加したい商品名を教えてください。",
      {},
    );
  }

  const items = await fetchAllItems();
  if (!items) return buildErrorResponse("在庫情報の取得に失敗しました。");

  const geminiResult = await queryGemini(buildAddToShoppingListPrompt(query), items);
  if (geminiResult.kind === "timeout") return buildTimeoutResponse();
  if (geminiResult.kind === "error") return buildErrorResponse();

  const result = geminiResult.data;

  if (result.stockStatus === "not_found") {
    const ok = await addToShoppingList(query, null);
    return buildTellResponse(
      ok ? `${query}を買い物リストに追加しました。` : "買い物リストへの追加に失敗しました。",
    );
  }

  const matchedItem = result.matchedItems[0];
  const { speech, pendingAction } = buildConfirmSpeech(result, query);

  const newSessionAttributes: SessionAttributes = {
    ...sessionAttributes,
    pendingAction,
    pendingItem: {
      id: matchedItem?.id ?? null,
      name: matchedItem?.name ?? query,
      units: matchedItem?.units ?? 0,
      content_amount: matchedItem?.content_amount ?? 1,
      content_unit: matchedItem?.content_unit ?? "個",
      opened_remaining: matchedItem?.opened_remaining ?? null,
    },
    pendingQuery: query,
  };

  return buildAskResponse(speech, "買い物リストに追加しますか？", newSessionAttributes);
};
