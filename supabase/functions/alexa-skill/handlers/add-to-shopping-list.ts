import type { AlexaResponse, SessionAttributes } from "../types.ts";
import { buildAskResponse } from "../response.ts";

// TODO: implement in feature/alexa-shopping-list-intent (#151)
export const handleAddToShoppingList = async (
  query: string,
  _sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  if (!query) {
    return buildAskResponse(
      "何を買い物リストに追加しますか？商品名を教えてください。",
      "追加したい商品名を教えてください。",
      {},
    );
  }
  return buildAskResponse(
    `${query}の買い物リスト追加は準備中です。`,
    "他に何かできることはありますか？",
    {},
  );
};
