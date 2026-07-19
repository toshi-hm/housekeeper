import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { isSpeechInputSupported, useSpeechInput } from "./useSpeechInput";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(I18nextProvider, { i18n }, children);

/** テストで使う最小限のモック `SpeechRecognition` インスタンスの形。 */
interface MockRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionTestWindow {
  SpeechRecognition?: new () => MockRecognitionInstance;
  webkitSpeechRecognition?: new () => MockRecognitionInstance;
}

const getTestWindow = () => window as unknown as SpeechRecognitionTestWindow;

/**
 * モック `SpeechRecognition` コンストラクタを作る。生成されたインスタンスは
 * 呼び出し順に `instances` へ積まれる（`this` を変数へエイリアスしないよう、
 * コンストラクタ内では配列への push と callback 呼び出しのみを行う）。
 */
const createMockRecognitionCtor = (onCreate?: (instance: MockRecognitionInstance) => void) => {
  const instances: MockRecognitionInstance[] = [];

  class MockSpeechRecognition implements MockRecognitionInstance {
    lang = "";
    continuous = true;
    interimResults = true;
    onresult: MockRecognitionInstance["onresult"] = null;
    onerror: MockRecognitionInstance["onerror"] = null;
    onend: MockRecognitionInstance["onend"] = null;
    start = () => {};
    stop = () => {};
    abort = () => {};

    constructor() {
      instances.push(this);
      onCreate?.(this);
    }
  }

  return { Ctor: MockSpeechRecognition, instances };
};

afterEach(async () => {
  const w = getTestWindow();
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  // renderHook 側のコンポーネントがまだ unmount されていない可能性があるため、
  // act で包んで言語変更による再レンダーを同期的に処理する。
  await act(async () => {
    await i18n.changeLanguage("ja");
  });
});

describe("isSpeechInputSupported", () => {
  it("SpeechRecognition も webkitSpeechRecognition も存在しない場合は false", () => {
    expect(isSpeechInputSupported()).toBe(false);
  });

  it("webkitSpeechRecognition があれば true", () => {
    getTestWindow().webkitSpeechRecognition = createMockRecognitionCtor().Ctor;
    expect(isSpeechInputSupported()).toBe(true);
  });
});

describe("useSpeechInput", () => {
  it("非対応環境(Firefox等)では isSupported=false になり、start() は例外を投げず何もしない", () => {
    const results: string[] = [];
    const { result } = renderHook(() => useSpeechInput((t) => results.push(t)), { wrapper });

    expect(result.current.isSupported).toBe(false);
    expect(result.current.isListening).toBe(false);

    act(() => {
      result.current.start();
    });

    // 非対応環境では start() は no-op のまま — isListening は false のまま、onResult も呼ばれない
    expect(result.current.isListening).toBe(false);
    expect(results).toEqual([]);
  });

  it("対応環境: start() で認識が始まり、確定結果が onResult に渡される", async () => {
    const { Ctor, instances } = createMockRecognitionCtor();
    getTestWindow().SpeechRecognition = Ctor;
    await i18n.changeLanguage("ja");

    const results: string[] = [];
    const { result } = renderHook(() => useSpeechInput((t) => results.push(t)), { wrapper });

    expect(result.current.isSupported).toBe(true);

    act(() => {
      result.current.start();
    });

    const lastInstance = instances.at(-1);
    expect(result.current.isListening).toBe(true);
    expect(lastInstance).toBeDefined();
    // continuous:false, interimResults:false で spec 通り上書きされていること
    expect(lastInstance?.continuous).toBe(false);
    expect(lastInstance?.interimResults).toBe(false);
    expect(lastInstance?.lang).toBe("ja-JP");

    act(() => {
      lastInstance?.onresult?.({ results: [[{ transcript: "牛乳" }]] });
    });

    expect(results).toEqual(["牛乳"]);

    act(() => {
      lastInstance?.onend?.();
    });

    expect(result.current.isListening).toBe(false);
  });

  it("対応環境: i18n.language が en のとき lang は en-US になる", async () => {
    const { Ctor, instances } = createMockRecognitionCtor();
    getTestWindow().SpeechRecognition = Ctor;
    await i18n.changeLanguage("en");

    const { result } = renderHook(() => useSpeechInput(() => {}), { wrapper });

    act(() => {
      result.current.start();
    });

    expect(instances.at(-1)?.lang).toBe("en-US");
  });

  it("認識中に stop() を呼ぶと下位の recognition.stop() が呼ばれる", () => {
    let stopCalls = 0;
    const { Ctor, instances } = createMockRecognitionCtor((instance) => {
      instance.stop = () => {
        stopCalls += 1;
      };
    });
    getTestWindow().SpeechRecognition = Ctor;

    const { result } = renderHook(() => useSpeechInput(() => {}), { wrapper });

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.stop();
    });

    expect(instances.at(-1)).toBeDefined();
    expect(stopCalls).toBe(1);
  });

  it("エラー発生時(onerror)は isListening が false に戻り、再度 start() できる", () => {
    const { Ctor, instances } = createMockRecognitionCtor();
    getTestWindow().SpeechRecognition = Ctor;

    const { result } = renderHook(() => useSpeechInput(() => {}), { wrapper });

    act(() => {
      result.current.start();
    });
    expect(result.current.isListening).toBe(true);

    act(() => {
      instances.at(-1)?.onerror?.({ error: "no-speech" });
    });

    expect(result.current.isListening).toBe(false);

    act(() => {
      result.current.start();
    });
    expect(result.current.isListening).toBe(true);
    expect(instances.length).toBe(2);
  });
});
