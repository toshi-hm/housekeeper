import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import type { AlexaResponse, PendingShoppingItem, SessionAttributes } from "../types.ts";
import { buildAskResponse, buildErrorResponse, buildTellResponse } from "../response.ts";
import { getSupabaseClient } from "../supabase-client.ts";
import {
  findDuplicatePlannedItem,
  type ShoppingPlannedRow,
} from "../../_shared/shoppingDuplicates.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InsertResult {
  ok: boolean;
  merged: boolean;
}

// Mirrors src/hooks/useShoppingList.ts's mergeIntoDuplicatePlannedItem: if an
// existing `planned` row matches by linked_item_id or normalized name,
// increment its desired_units instead of inserting a duplicate row (#946).
const mergeIntoDuplicatePlannedItem = async (
  supabase: SupabaseClient,
  userId: string,
  name: string,
  linkedItemId: string | null,
): Promise<boolean> => {
  const { data: plannedRows, error } = await supabase
    .from("shopping_list_items")
    .select("id, name, desired_units, linked_item_id")
    .eq("user_id", userId)
    .eq("status", "planned");
  if (error) {
    console.error("[yes-no] shopping list fetch error:", error);
    return false;
  }

  const duplicate = findDuplicatePlannedItem((plannedRows ?? []) as ShoppingPlannedRow[], {
    name,
    linked_item_id: linkedItemId,
  });
  if (!duplicate) return false;

  const { error: updateError } = await supabase
    .from("shopping_list_items")
    .update({
      desired_units: duplicate.desired_units + 1,
      linked_item_id: duplicate.linked_item_id ?? linkedItemId,
    })
    .eq("id", duplicate.id);
  if (updateError) {
    console.error("[yes-no] shopping list merge update error:", updateError);
    return false;
  }
  return true;
};

const insertShoppingListItem = async (item: PendingShoppingItem): Promise<InsertResult> => {
  const ctx = getSupabaseClient();
  if (!ctx) {
    console.error("[yes-no] Missing required environment variables");
    return { ok: false, merged: false };
  }
  const { supabase, userId } = ctx;
  // Validate that linked_item_id is a proper UUID before using it; Gemini output may be malformed
  const linkedItemId = item.id && UUID_REGEX.test(item.id) ? item.id : null;

  if (await mergeIntoDuplicatePlannedItem(supabase, userId, item.name, linkedItemId)) {
    return { ok: true, merged: true };
  }

  const { error } = await supabase.from("shopping_list_items").insert({
    user_id: userId,
    name: item.name,
    desired_units: 1,
    status: "planned",
    linked_item_id: linkedItemId,
  });
  if (error) {
    // A concurrent request may have inserted/matched a same-name (or same
    // linked_item_id) planned row between our client-side check above and
    // this insert, tripping the DB-level unique constraint
    // (shopping_planned_name_unique / shopping_planned_linked_item_unique).
    // Retry the merge now that the conflicting row actually exists, mirroring
    // the #766 retry in useShoppingList.ts's upsertShoppingItem.
    if (
      error.code === "23505" &&
      (await mergeIntoDuplicatePlannedItem(supabase, userId, item.name, linkedItemId))
    ) {
      return { ok: true, merged: true };
    }
    console.error("[yes-no] shopping list insert error:", error);
    return { ok: false, merged: false };
  }
  return { ok: true, merged: false };
};

const buildInsertResultSpeech = (name: string, result: InsertResult): string => {
  if (!result.ok) return "買い物リストへの追加に失敗しました。";
  return result.merged
    ? `${name}はすでに買い物リストにあったため、数量を増やしました。`
    : `${name}を買い物リストに追加しました。`;
};

export const handleYesNo = async (
  isYes: boolean,
  sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  const { pendingAction, pendingItem } = sessionAttributes;

  if (!pendingAction) {
    return buildTellResponse("わかりました。");
  }

  if (pendingAction === "add_to_shopping_list") {
    if (!isYes) {
      return buildTellResponse("わかりました。キャンセルしました。");
    }
    if (!pendingItem) {
      return buildErrorResponse("追加する商品が見つかりませんでした。");
    }
    const item = pendingItem as PendingShoppingItem;
    const result = await insertShoppingListItem(item);
    return buildTellResponse(buildInsertResultSpeech(item.name, result));
  }

  if (pendingAction === "choose_alternate") {
    if (isYes) {
      if (!pendingItem) {
        return buildErrorResponse("追加する商品が見つかりませんでした。");
      }
      const item = pendingItem as PendingShoppingItem;
      const result = await insertShoppingListItem(item);
      return buildTellResponse(buildInsertResultSpeech(item.name, result));
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

  return buildTellResponse("わかりました。");
};
