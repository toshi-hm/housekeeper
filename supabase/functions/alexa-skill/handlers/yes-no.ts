import { createClient } from "jsr:@supabase/supabase-js@2";
import type { AlexaResponse, SessionAttributes } from "../types.ts";
import { buildAskResponse, buildTellResponse } from "../response.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const userId = Deno.env.get("USER_ID")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const handleYesNo = async (
  isYes: boolean,
  sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  const { pendingAction, pendingItem, pendingQuery } = sessionAttributes;

  if (!pendingAction) {
    return buildTellResponse(isYes ? "わかりました。" : "わかりました。");
  }

  if (pendingAction === "add_to_shopping_list") {
    if (!isYes) {
      return buildTellResponse("わかりました。キャンセルしました。");
    }

    if (!pendingItem) {
      return buildTellResponse("申し訳ありません。追加する商品が見つかりませんでした。");
    }

    const item = pendingItem as {
      id: string | null;
      name: string;
    };

    const { error } = await supabase.from("shopping_list_items").insert({
      user_id: userId,
      name: item.name,
      desired_units: 1,
      status: "planned",
      linked_item_id: item.id,
    });

    if (error) {
      console.error("[yes-no] shopping list insert error:", error);
      return buildTellResponse("買い物リストへの追加に失敗しました。");
    }

    return buildTellResponse(`${item.name}を買い物リストに追加しました。`);
  }

  if (pendingAction === "choose_alternate") {
    if (isYes) {
      // 別の商品を追加する → 発話を促す
      return buildAskResponse(
        "どの商品を追加しますか？",
        "追加する商品名を教えてください。",
        { ...sessionAttributes, pendingAction: undefined },
      );
    }
    return buildTellResponse("わかりました。キャンセルしました。");
  }

  return buildTellResponse(isYes ? "わかりました。" : "わかりました。");
};
