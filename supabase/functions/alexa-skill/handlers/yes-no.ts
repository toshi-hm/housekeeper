import type { AlexaResponse, SessionAttributes } from "../types.ts";
import { buildTellResponse } from "../response.ts";

// TODO: implement full multi-turn dialog in feature/alexa-shopping-list-intent (#151)
export const handleYesNo = async (
  isYes: boolean,
  sessionAttributes: SessionAttributes,
): Promise<AlexaResponse> => {
  if (!sessionAttributes.pendingAction) {
    return buildTellResponse(isYes ? "はい、わかりました。" : "わかりました。");
  }
  // placeholder until #151
  return buildTellResponse("この機能は準備中です。");
};
