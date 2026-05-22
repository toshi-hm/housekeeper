import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse } from "../response.ts";

// TODO: implement in feature/alexa-inventory-intents (#150)
export const handleCheckExpiry = async (query: string): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何の賞味期限を確認しますか？");
  return buildErrorResponse(`${query}の賞味期限確認は準備中です。`);
};
