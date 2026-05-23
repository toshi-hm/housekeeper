import type { AlexaResponse } from "../types.ts";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "../response.ts";
import { fetchAllItems } from "../inventory.ts";
import { buildListByLocationPrompt, queryGemini } from "../gemini.ts";

export const handleListByLocation = async (location: string): Promise<AlexaResponse> => {
  if (!location) {
    return buildAskResponse(
      "どこの在庫を確認しますか？場所を教えてください。",
      "確認したい場所を教えてください。",
      {},
    );
  }

  const items = await fetchAllItems();
  if (!items) return buildErrorResponse("在庫情報の取得に失敗しました。");

  const geminiResult = await queryGemini(buildListByLocationPrompt(location), items);
  if (geminiResult.kind === "timeout") return buildTimeoutResponse();
  if (geminiResult.kind === "error") return buildErrorResponse();

  return buildTellResponse(geminiResult.data.speech);
};
