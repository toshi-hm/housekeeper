import type { AlexaResponse } from "../types.ts";
import { buildAskResponse } from "../response.ts";

// TODO: implement in feature/alexa-inventory-intents (#150)
export const handleListByLocation = async (location: string): Promise<AlexaResponse> => {
  if (!location) {
    return buildAskResponse(
      "どこの在庫を確認しますか？場所を教えてください。",
      "確認したい場所を教えてください。",
      {},
    );
  }
  return buildAskResponse(
    `${location}の在庫一覧は準備中です。`,
    "他に確認することはありますか？",
    {},
  );
};
