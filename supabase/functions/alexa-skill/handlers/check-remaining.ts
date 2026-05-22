import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse, buildTellResponse, buildTimeoutResponse } from "../response.ts";
import { fetchAllItems } from "../inventory.ts";
import { buildCheckRemainingPrompt, queryGemini } from "../gemini.ts";

export const handleCheckRemaining = async (query: string): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何の残量を確認しますか？");

  const items = await fetchAllItems();
  const result = await queryGemini(buildCheckRemainingPrompt(query), items);

  if (!result) return buildTimeoutResponse();

  return buildTellResponse(result.speech);
};
