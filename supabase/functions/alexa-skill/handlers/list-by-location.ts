import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse } from "../response.ts";

// TODO: implement in feature/alexa-inventory-intents (#150)
export const handleListByLocation = async (location: string): Promise<AlexaResponse> => {
  if (!location) return buildErrorResponse("どこの在庫を確認しますか？");
  return buildErrorResponse(`${location}の在庫一覧は準備中です。`);
};
