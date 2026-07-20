import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";

import { VoiceInputButton } from "./VoiceInputButton";

const labels = {
  label: "音声入力",
  listeningLabel: "音声を認識中...",
};

describe("VoiceInputButton", () => {
  it("Web Speech API 非対応環境では何もレンダリングしない", () => {
    const { container } = render(
      <VoiceInputButton {...labels} isSupported={false} isListening={false} onStart={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("対応環境ではマイクボタンをレンダリングし、クリックを通知する", () => {
    const onStart = mock(() => {});
    const { getByRole } = render(
      <VoiceInputButton {...labels} isSupported isListening={false} onStart={onStart} />,
    );
    const button = getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("音声入力");
    fireEvent.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("認識中は専用ラベルで無効化する", () => {
    const { getByRole } = render(
      <VoiceInputButton {...labels} isSupported isListening onStart={() => {}} />,
    );
    const button = getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("音声を認識中...");
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
