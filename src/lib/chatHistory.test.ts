import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "@/types/chat";

import { markMessageFailed, toHistory } from "./chatHistory";

describe("toHistory / markMessageFailed (#554)", () => {
  const messages: ChatMessage[] = [
    { id: "1", role: "user", text: "牛乳ある？" },
    { id: "2", role: "assistant", text: "2本あります。" },
    { id: "3", role: "user", text: "パンは？" },
  ];

  test("isErrorなメッセージをhistoryから除外する", () => {
    const failed = markMessageFailed(messages, "3");
    const history = toHistory(failed);
    // The unpaired user turn ("パンは？") must be excluded so history keeps
    // alternating user/model turns.
    expect(history).toEqual([
      { role: "user", text: "牛乳ある？" },
      { role: "model", text: "2本あります。" },
    ]);
  });

  test("該当idが存在しない場合はメッセージ配列を変更しない", () => {
    const result = markMessageFailed(messages, "does-not-exist");
    expect(result).toEqual(messages);
  });

  test("markMessageFailedを通さない場合は失敗したuserターンがhistoryに残る", () => {
    const history = toHistory(messages);
    expect(history).toEqual([
      { role: "user", text: "牛乳ある？" },
      { role: "model", text: "2本あります。" },
      { role: "user", text: "パンは？" },
    ]);
  });
});
