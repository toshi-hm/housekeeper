import type { AlexaResponse, SessionAttributes } from "./types.ts";

export const buildTellResponse = (
  speech: string,
  sessionAttributes?: SessionAttributes,
): AlexaResponse => ({
  version: "1.0",
  sessionAttributes,
  response: {
    outputSpeech: { type: "PlainText", text: speech },
    shouldEndSession: true,
  },
});

export const buildAskResponse = (
  speech: string,
  reprompt: string,
  sessionAttributes: SessionAttributes,
): AlexaResponse => ({
  version: "1.0",
  sessionAttributes,
  response: {
    outputSpeech: { type: "PlainText", text: speech },
    reprompt: { outputSpeech: { type: "PlainText", text: reprompt } },
    shouldEndSession: false,
  },
});

export const buildErrorResponse = (message?: string): AlexaResponse =>
  buildTellResponse(
    message ?? "申し訳ありません。エラーが発生しました。もう一度お試しください。",
  );

export const buildTimeoutResponse = (): AlexaResponse =>
  buildTellResponse(
    "ただいま応答に時間がかかっています。もう一度お試しください。",
  );
