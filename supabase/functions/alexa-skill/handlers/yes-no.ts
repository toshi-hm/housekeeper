import type { AlexaResponse, PendingShoppingItem, SessionAttributes } from "../types.ts";
import { buildAskResponse, buildErrorResponse, buildTellResponse } from "../response.ts";
import { getSupabaseClient } from "../supabase-client.ts";

const insertShoppingListItem = async (item: PendingShoppingItem): Promise<boolean> => {
  const ctx = getSupabaseClient();
  if (!ctx) {
    console.error("[yes-no] Missing required environment variables");
    return false;
  }
  const { supabase, userId } = ctx;
  const { error } = await supabase.from("shopping_list_items").insert({
    user_id: userId,
    name: item.name,
    desired_units: 1,
    status: "planned",
    linked_item_id: item.id,
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
      // 複数候補のうち最初のアイテムを追加
      if (!pendingItem) {
        return buildErrorResponse("追加する商品が見つかりませんでした。");
      }
      const item = pendingItem as PendingShoppingItem;
      const ok = await insertShoppingListItem(item);
      return buildTellResponse(
        ok ? `${item.name}を買い物リストに追加しました。` : "買い物リストへの追加に失敗しました。",
      );
    }
    // No → 別の商品名を聞く
    return buildAskResponse("別の商品名を教えてください。", "追加したい商品名を教えてください。", {
      ...sessionAttributes,
      pendingAction: undefined,
      pendingItem: undefined,
    });
  }

  return buildTellResponse(isYes ? "わかりました。" : "わかりました。");
};
