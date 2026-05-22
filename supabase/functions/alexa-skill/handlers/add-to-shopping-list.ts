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

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const userId = Deno.env.get("USER_ID")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const addToShoppingList = async (
  name: string,
  linkedItemId: string | null,
): Promise<boolean> => {
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

const buildConfirmSpeech = (result: GeminiMatchResult, query: string): string => {
  const item = result.matchedItems[0];
  if (!item) return `${query}を買い物リストに追加しますか？`;

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

  if (result.matchedItems.length > 1) {
    return `${query}は、自宅に${item.name}が${remaining}ありますが、同じ商品を買い物リストに追加しますか？それとも別の商品を追加しますか？`;
  }

  return `すでに自宅に${item.name}は${remaining}ありますが、買い物リストに追加してよいですか？`;
};

export const handleAddToShoppingList = async (
  query: string,
  sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何を買い物リストに追加しますか？");

  const items = await fetchAllItems();
  const result = await queryGemini(buildAddToShoppingListPrompt(query), items);

  if (!result) return buildTimeoutResponse();

  if (result.stockStatus === "not_found") {
    // 在庫に一切ない → 確認なしで直接追加
    const ok = await addToShoppingList(query, null);
    return buildTellResponse(
      ok
        ? `${query}を買い物リストに追加しました。`
        : "買い物リストへの追加に失敗しました。",
    );
  }

  const matchedItem = result.matchedItems[0];
  const speech = buildConfirmSpeech(result, query);
  const reprompt = "買い物リストに追加しますか？";

  const newSessionAttributes: SessionAttributes = {
    ...sessionAttributes,
    pendingAction: "add_to_shopping_list",
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

  return buildAskResponse(speech, reprompt, newSessionAttributes);
};
