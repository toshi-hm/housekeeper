import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { VoiceInputButton } from "./VoiceInputButton";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

interface MockRecognitionCtor {
  new (): {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: (() => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
  };
}

interface SpeechRecognitionTestWindow {
  SpeechRecognition?: MockRecognitionCtor;
}

const getTestWindow = () => window as unknown as SpeechRecognitionTestWindow;

const MockSpeechRecognition: MockRecognitionCtor = class {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult = null;
  onerror = null;
  onend = null;
  start = () => {};
  stop = () => {};
  abort = () => {};
};

beforeEach(async () => {
  await i18n.changeLanguage("ja");
});

afterEach(() => {
  delete getTestWindow().SpeechRecognition;
});

describe("VoiceInputButton", () => {
  it("Web Speech API 非対応環境では何もレンダリングしない", () => {
    const { container } = render(<VoiceInputButton onResult={() => {}} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("対応環境ではマイクボタンをレンダリングする", () => {
    getTestWindow().SpeechRecognition = MockSpeechRecognition;

    const { getByRole } = render(<VoiceInputButton onResult={() => {}} />, { wrapper });
    const button = getByRole("button");
    expect(button).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("音声入力");
  });

  it("label props を渡すと aria-label に反映される", () => {
    getTestWindow().SpeechRecognition = MockSpeechRecognition;

    const { getByRole } = render(
      <VoiceInputButton onResult={() => {}} label="商品名を音声入力" />,
      { wrapper },
    );
    expect(getByRole("button").getAttribute("aria-label")).toBe("商品名を音声入力");
  });
});
