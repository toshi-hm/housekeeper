import type { AlexaResponse, PendingShoppingItem, SessionAttributes } from "../types.ts";
import { buildAskResponse, buildErrorResponse, buildTellResponse } from "../response.ts";
import { getSupabaseClient } from "../supabase-client.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const insertShoppingListItem = async (item: PendingShoppingItem): Promise<boolean> => {
  const ctx = getSupabaseClient();
  if (!ctx) {
    console.error("[yes-no] Missing required environment variables");
    return false;
  }
  const { supabase, userId } = ctx;
  // Validate that linked_item_id is a proper UUID before using it; Gemini output may be malformed
  const linkedItemId = item.id && UUID_REGEX.test(item.id) ? item.id : null;
  const { error } = await supabase.from("shopping_list_items").insert({
    user_id: userId,
    name: item.name,
    desired_units: 1,
    status: "planned",
    linked_item_id: linkedItemId,
  });
  if (error) {
    console.error("[yes-no] shopping list insert error:", error);
    return false;
  }
  return true;
};

export const handleYesNo = async (
  isYes: boolean,
  sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  const { pendingAction, pendingItem } = sessionAttributes;

  if (!pendingAction) {
    return buildTellResponse(isYes ? "わかりました。" : "わかりました。");
  }

  if (pendingAction === "add_to_shopping_list") {
    if (!isYes) {
      return buildTellResponse("わかりました。キャンセルしました。");
    }
    if (!pendingItem) {
      return buildErrorResponse("追加する商品が見つかりませんでした。");
    }
    const item = pendingItem as PendingShoppingItem;
    const ok = await insertShoppingListItem(item);
    return buildTellResponse(
      ok ? `${item.name}を買い物リストに追加しました。` : "買い物リストへの追加に失敗しました。",
    );
  }

  if (pendingAction === "choose_alternate") {
    if (isYes) {
      if (!pendingItem) {
        return buildErrorResponse("追加する商品が見つかりませんでした。");
      }
      const item = pendingItem as PendingShoppingItem;
      const ok = await insertShoppingListItem(item);
      return buildTellResponse(
        ok ? `${item.name}を買い物リストに追加しました。` : "買い物リストへの追加に失敗しました。",
      );
    }
    // No → 全フレーズで言い直してもらう（インタラクションモデルに単品名のみの発話例がないため）
    return buildAskResponse(
      "わかりました。追加したい商品は「○○を買い物リストに追加して」と話しかけてください。",
      "追加したい場合は「○○を買い物リストに追加して」と言ってください。",
      {
        ...sessionAttributes,
        pendingAction: undefined,
        pendingItem: undefined,
        pendingQuery: undefined,
      },
    );
  }

  return buildTellResponse(isYes ? "わかりました。" : "わかりました。");
};
