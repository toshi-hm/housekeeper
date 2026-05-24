import type { AlexaResponse, GeminiMatchResult, SessionAttributes } from "../types.ts";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "../response.ts";
import { fetchAllItems, formatTotalRemaining } from "../inventory.ts";
import { buildAddToShoppingListPrompt, queryGemini } from "../gemini.ts";

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
    // 在庫になくても確認ダイアログを挟む（Issue #151 要件）
    const newSessionAttributes: SessionAttributes = {
      ...sessionAttributes,
      pendingAction: "add_to_shopping_list",
      pendingItem: {
        id: null,
        name: query,
        units: 0,
        content_amount: 1,
        content_unit: "個",
        opened_remaining: null,
      },
      pendingQuery: query,
    };
    return buildAskResponse(
      `${query}は在庫に見つかりませんでした。新しいアイテムとして買い物リストに追加しますか？`,
      "買い物リストに追加しますか？",
      newSessionAttributes,
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
