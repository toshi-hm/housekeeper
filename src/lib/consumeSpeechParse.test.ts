import { describe, expect, it } from "bun:test";

import { parseConsumeSpeech } from "./consumeSpeechParse";

describe("parseConsumeSpeech", () => {
  it("半角算用数字と単位を抽出する", () => {
    expect(parseConsumeSpeech("たまごを2個使った", ["個"])).toEqual({
      amount: 2,
      unit: "個",
    });
  });

  it("全角算用数字を半角に正規化し、ラテン単位のカタカナ読みも認識する", () => {
    expect(parseConsumeSpeech("牛乳を２００ミリリットル使った", ["mL", "L"])).toEqual({
      amount: 200,
      unit: "mL",
    });
  });

  it("小数の数量を抽出する", () => {
    expect(parseConsumeSpeech("0.5リットル使った", ["mL", "L"])).toEqual({
      amount: 0.5,
      unit: "L",
    });
  });

  it("算用数字が無い場合は漢数字（一〜十）にフォールバックする", () => {
    expect(parseConsumeSpeech("卵を三個使った", ["個"])).toEqual({
      amount: 3,
      unit: "個",
    });
  });

  it("読み仮名が部分文字列を共有する単位同士でも長い方を優先する（g vs kg の混同防止）", () => {
    expect(parseConsumeSpeech("1キログラム使った", ["g", "kg"])).toEqual({
      amount: 1,
      unit: "kg",
    });
  });

  it("数量・単位のどちらも見つからない場合はnullを返す", () => {
    expect(parseConsumeSpeech("よくわからない発話", ["個", "mL"])).toEqual({
      amount: null,
      unit: null,
    });
  });

  it("候補単位が空でも数量だけは抽出できる", () => {
    expect(parseConsumeSpeech("2個使った", [])).toEqual({
      amount: 2,
      unit: null,
    });
  });
});
