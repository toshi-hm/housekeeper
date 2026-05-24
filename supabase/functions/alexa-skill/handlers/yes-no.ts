import { createClient } from "jsr:@supabase/supabase-js@2";
import type { AlexaResponse, PendingShoppingItem, SessionAttributes } from "../types.ts";
import { buildAskResponse, buildErrorResponse, buildTellResponse } from "../response.ts";

const insertShoppingListItem = async (item: PendingShoppingItem): Promise<boolean> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userId = Deno.env.get("USER_ID");
  if (!supabaseUrl || !supabaseServiceKey || !userId) {
    console.error("[yes-no] Missing required environment variables");
    return false;
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
