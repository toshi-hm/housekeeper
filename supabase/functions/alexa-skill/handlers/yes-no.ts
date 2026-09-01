import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import {
  findDuplicatePlannedItem,
  type ShoppingPlannedRow,
} from "../../_shared/shoppingDuplicates.ts";
import type { AlexaResponse, PendingShoppingItem, SessionAttributes } from "../types.ts";
import { buildAskResponse, buildErrorResponse, buildTellResponse } from "../response.ts";
import { getSupabaseClient } from "../supabase-client.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UpsertShoppingListItemResult {
  ok: boolean;
  /** true なら新規行ではなく、既存の planned 行へ desired_units を統合した */
  merged: boolean;
}

/**
 * 既存の planned 行の中から統合対象を探し、見つかれば desired_units を
 * インクリメントして統合する。見つからなければ null（呼び出し元が新規 insert する）。
 */
const mergeIntoDuplicatePlannedItem = async (
  supabase: SupabaseClient,
  userId: string,
  name: string,
  linkedItemId: string | null,
): Promise<ShoppingPlannedRow | null> => {
  const { data: plannedRows, error: plannedError } = await supabase
    .from("shopping_list_items")
    .select("id, name, desired_units, linked_item_id")
    .eq("user_id", userId)
    .eq("status", "planned");
  if (plannedError) {
    console.error("[yes-no] planned rows fetch error:", plannedError);
    return null;
  }

  const duplicate = findDuplicatePlannedItem((plannedRows ?? []) as ShoppingPlannedRow[], {
    name,
    linked_item_id: linkedItemId,
  });
  if (!duplicate) return null;

  const { data, error } = await supabase
    .from("shopping_list_items")
    .update({
      desired_units: duplicate.desired_units + 1,
      linked_item_id: duplicate.linked_item_id ?? linkedItemId,
    })
    .eq("id", duplicate.id)
    .select("id, name, desired_units, linked_item_id")
    .single();
  if (error) {
    console.error("[yes-no] merge update error:", error);
    return null;
  }
  return data as ShoppingPlannedRow;
};

/**
 * 買い物リストへの追加。web 側の useShoppingList.ts の
 * upsertShoppingItem/mergeIntoDuplicatePlannedItem と同じ重複統合ルールを
 * Alexa スキルの追加パスにも適用する (#946)。同一 linked_item_id、または
 * 前後空白を無視・大文字小文字を区別しない名前一致の planned 行が既にあれば、
 * 新規 insert せず desired_units をインクリメントして統合する。
 *
 * クライアント側チェックと insert の間に競合が起きた場合（#766 と同じ理由で
 * DB 側のユニーク制約 shopping_planned_linked_item_unique /
 * shopping_planned_name_unique に insert がぶつかった場合）も、web 側同様
 * 23505 をキャッチしてマージへリトライする。
 */
export const upsertShoppingListItem = async (
  supabase: SupabaseClient,
  userId: string,
  item: PendingShoppingItem,
): Promise<UpsertShoppingListItemResult> => {
  // Validate that linked_item_id is a proper UUID before using it; Gemini output may be malformed
  const linkedItemId = item.id && UUID_REGEX.test(item.id) ? item.id : null;

  const merged = await mergeIntoDuplicatePlannedItem(supabase, userId, item.name, linkedItemId);
  if (merged) return { ok: true, merged: true };

  const { error } = await supabase.from("shopping_list_items").insert({
    user_id: userId,
    name: item.name,
    desired_units: 1,
    status: "planned",
    linked_item_id: linkedItemId,
  });
  if (!error) return { ok: true, merged: false };

  if (error.code === "23505") {
    const retried = await mergeIntoDuplicatePlannedItem(supabase, userId, item.name, linkedItemId);
    if (retried) return { ok: true, merged: true };
  }

  console.error("[yes-no] shopping list insert error:", error);
  return { ok: false, merged: false };
};

const insertShoppingListItem = async (
  item: PendingShoppingItem,
): Promise<UpsertShoppingListItemResult> => {
  const ctx = getSupabaseClient();
  if (!ctx) {
    console.error("[yes-no] Missing required environment variables");
    return { ok: false, merged: false };
  }
  return upsertShoppingListItem(ctx.supabase, ctx.userId, item);
};

/** 追加結果に応じた読み上げ文言。統合時に「追加しました」と誤って言わないようにする (#946)。 */
export const buildAddResultSpeech = (
  name: string,
  result: UpsertShoppingListItemResult,
): string => {
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
    return buildTellResponse(buildAddResultSpeech(item.name, result));
  }

  if (pendingAction === "choose_alternate") {
    if (isYes) {
      if (!pendingItem) {
        return buildErrorResponse("追加する商品が見つかりませんでした。");
      }
      const item = pendingItem as PendingShoppingItem;
      const result = await insertShoppingListItem(item);
      return buildTellResponse(buildAddResultSpeech(item.name, result));
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
