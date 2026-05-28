import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import {
  buildAskResponse,
  buildErrorResponse,
  buildTellResponse,
  buildTimeoutResponse,
} from "./response.ts";

Deno.test("buildTellResponse - speech and shouldEndSession=true", () => {
  const res = buildTellResponse("テスト応答");
  assertStrictEquals(res.version, "1.0");
  assertStrictEquals(res.response.outputSpeech.type, "PlainText");
  assertStrictEquals(res.response.outputSpeech.text, "テスト応答");
  assertStrictEquals(res.response.shouldEndSession, true);
  assertStrictEquals(res.response.reprompt, undefined);
  assertStrictEquals(res.sessionAttributes, undefined);
});

Deno.test("buildTellResponse - with sessionAttributes", () => {
  const attrs = { pendingAction: "add_to_shopping_list" as const };
  const res = buildTellResponse("応答", attrs);
  assertEquals(res.sessionAttributes, attrs);
  assertStrictEquals(res.response.shouldEndSession, true);
});

Deno.test("buildAskResponse - shouldEndSession=false, reprompt present", () => {
  const res = buildAskResponse("質問", "再プロンプト", {});
  assertStrictEquals(res.version, "1.0");
  assertStrictEquals(res.response.shouldEndSession, false);
  assertStrictEquals(res.response.outputSpeech.text, "質問");
  assertStrictEquals(res.response.reprompt?.outputSpeech.type, "PlainText");
  assertStrictEquals(res.response.reprompt?.outputSpeech.text, "再プロンプト");
  assertEquals(res.sessionAttributes, {});
});

Deno.test("buildAskResponse - sessionAttributes passed through", () => {
  const attrs = { pendingQuery: "牛乳" };
  const res = buildAskResponse("質問", "再プロンプト", attrs);
  assertEquals(res.sessionAttributes, attrs);
});

Deno.test("buildErrorResponse - default message ends session", () => {
  const res = buildErrorResponse();
  assertStrictEquals(res.response.shouldEndSession, true);
  assertStrictEquals(res.response.reprompt, undefined);
  const text = res.response.outputSpeech.text ?? "";
  assertEquals(text.length > 0, true);
});

Deno.test("buildErrorResponse - custom message", () => {
  const res = buildErrorResponse("カスタムエラー");
  assertStrictEquals(res.response.outputSpeech.text, "カスタムエラー");
  assertStrictEquals(res.response.shouldEndSession, true);
});

Deno.test("buildTimeoutResponse - ends session with non-empty message", () => {
  const res = buildTimeoutResponse();
  assertStrictEquals(res.response.shouldEndSession, true);
  const text = res.response.outputSpeech.text ?? "";
  assertEquals(text.length > 0, true);
});
