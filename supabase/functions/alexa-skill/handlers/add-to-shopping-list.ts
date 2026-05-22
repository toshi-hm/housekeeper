import type { AlexaResponse, SessionAttributes } from "../types.ts";
import { buildErrorResponse } from "../response.ts";

// TODO: implement in feature/alexa-shopping-list-intent (#151)
export const handleAddToShoppingList = async (
  query: string,
  _sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何を買い物リストに追加しますか？");
  return buildErrorResponse(`${query}の買い物リスト追加は準備中です。`);
};
