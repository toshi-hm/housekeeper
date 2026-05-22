import type { AlexaResponse } from "../types.ts";
import { buildErrorResponse, buildTellResponse, buildTimeoutResponse } from "../response.ts";
import { fetchAllItems } from "../inventory.ts";
import { buildCheckInventoryPrompt, queryGemini } from "../gemini.ts";

export const handleCheckInventory = async (query: string): Promise<AlexaResponse> => {
  if (!query) return buildErrorResponse("何を調べますか？");

  const items = await fetchAllItems();
  const result = await queryGemini(buildCheckInventoryPrompt(query), items);

  if (!result) return buildTimeoutResponse();

  return buildTellResponse(result.speech);
};
