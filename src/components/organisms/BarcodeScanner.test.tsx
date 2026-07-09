import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

type DecodeCallback = (
  result: { getText: () => string } | undefined,
  error: Error | undefined,
) => void;

interface FakeDevice {
  deviceId: string;
  label: string;
}

const state: {
  devices: FakeDevice[];
  listError: Error | null;
  decodeError: Error | null;
  decodeCalls: Array<string | undefined>;
  lastCallback: DecodeCallback | null;
  stopCount: number;
} = {
  devices: [],
  listError: null,
  decodeError: null,
  decodeCalls: [],
  lastCallback: null,
  stopCount: 0,
};

class FakeBrowserMultiFormatReader {
  static listVideoInputDevices() {
    if (state.listError) return Promise.reject(state.listError);
    return Promise.resolve(state.devices);
  }

  decodeFromVideoDevice(
    deviceId: string | undefined,
    _video: HTMLVideoElement,
    callback: DecodeCallback,
  ) {
    state.decodeCalls.push(deviceId);
    if (state.decodeError) return Promise.reject(state.decodeError);
    state.lastCallback = callback;
    return Promise.resolve({
      stop: () => {
        state.stopCount += 1;
      },
    });
  }
}

mock.module("@zxing/browser", () => ({
  BrowserMultiFormatReader: FakeBrowserMultiFormatReader,
}));

const { BarcodeScanner } = await import("@/components/organisms/BarcodeScanner");

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const renderScanner = (props: Partial<Parameters<typeof BarcodeScanner>[0]> = {}) => {
  const defaultProps = { onScan: () => {}, onClose: () => {} };
  return render(<BarcodeScanner {...defaultProps} {...props} />, { wrapper });
};

beforeEach(() => {
  state.devices = [];
  state.listError = null;
  state.decodeError = null;
  state.decodeCalls = [];
  state.lastCallback = null;
  state.stopCount = 0;
});

describe("BarcodeScanner", () => {
  test("起動してスキャンを開始し、読み取り結果で onScan を呼ぶ", async () => {
    state.devices = [{ deviceId: "cam-1", label: "Front Camera" }];
    const onScan = mock(() => {});

    renderScanner({ onScan });

    await waitFor(() => expect(state.lastCallback).not.toBeNull());

    state.lastCallback?.({ getText: () => "4901234567890" }, undefined);
    expect(onScan).toHaveBeenCalledWith("4901234567890");

    // 背面カメラが特定できない場合は deviceId=undefined で開始する
    expect(state.decodeCalls[0]).toBeUndefined();
  });

  test("背面カメラのラベルがあればそのデバイスで開始する", async () => {
    state.devices = [
      { deviceId: "cam-front", label: "Front Camera" },
      { deviceId: "cam-back", label: "Back Camera" },
    ];

    renderScanner();

    await waitFor(() => expect(state.decodeCalls.length).toBeGreaterThan(0));
    expect(state.decodeCalls[0]).toBe("cam-back");
  });

  test("複数カメラがあれば切り替えボタンで次のカメラに切り替える", async () => {
    state.devices = [
      { deviceId: "cam-a", label: "Back Camera" },
      { deviceId: "cam-b", label: "Other Camera" },
    ];

    const { container } = renderScanner();

    await waitFor(() => expect(container.querySelector("svg.lucide-switch-camera")).not.toBeNull());

    const switchButton = container
      .querySelector("svg.lucide-switch-camera")
      ?.closest("button") as HTMLButtonElement;
    fireEvent.click(switchButton);

    await waitFor(() => expect(state.decodeCalls.length).toBe(2));
    expect(state.decodeCalls[1]).toBe("cam-b");
  });

  test("カメラ列挙に失敗するとエラー UI とリトライを表示する", async () => {
    state.listError = new Error("Permission denied");

    const { container, getByText } = renderScanner();

    await waitFor(() => expect(getByText("Permission denied")).toBeTruthy());

    // リトライで再スキャンを試みる
    state.listError = null;
    const retryButton = container.querySelectorAll("button");
    const retry = Array.from(retryButton).find((b) => b.textContent && !b.querySelector("svg"));
    expect(retry).toBeDefined();
    fireEvent.click(retry!);

    await waitFor(() => expect(state.decodeCalls.length).toBeGreaterThan(0));
  });

  test("decode 開始に失敗するとエラーメッセージを表示する", async () => {
    state.devices = [{ deviceId: "cam-1", label: "Camera" }];
    state.decodeError = new Error("Camera busy");

    const { getByText } = renderScanner();

    await waitFor(() => expect(getByText("Camera busy")).toBeTruthy());
  });

  test("閉じるボタンで onClose を呼ぶ", async () => {
    state.devices = [{ deviceId: "cam-1", label: "Camera" }];
    const onClose = mock(() => {});

    const { container } = renderScanner({ onClose });

    await waitFor(() => expect(state.lastCallback).not.toBeNull());

    const closeButton = container.querySelector("svg.lucide-x")?.closest("button");
    fireEvent.click(closeButton!);

    expect(onClose).toHaveBeenCalled();
  });

  test("手動入力: 入力して確定すると onScan を呼ぶ", async () => {
    state.devices = [{ deviceId: "cam-1", label: "Camera" }];
    const onScan = mock(() => {});

    const { container } = renderScanner({ onScan });

    await waitFor(() => expect(state.lastCallback).not.toBeNull());

    const keyboardButton = container.querySelector("svg.lucide-keyboard")?.closest("button");
    fireEvent.click(keyboardButton!);

    const input = container.querySelector("input") as HTMLInputElement;
    await userEvent.setup().type(input, " 4900000000001 ");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onScan).toHaveBeenCalledWith("4900000000001");
  });

  test("手動入力: 空のままでは確定ボタンが無効", async () => {
    state.devices = [{ deviceId: "cam-1", label: "Camera" }];

    const { container } = renderScanner();

    await waitFor(() => expect(state.lastCallback).not.toBeNull());

    const keyboardButton = container.querySelector("svg.lucide-keyboard")?.closest("button");
    fireEvent.click(keyboardButton!);

    const input = container.querySelector("input") as HTMLInputElement;
    const buttons = Array.from(container.querySelectorAll("button"));
    const confirmButton = buttons[buttons.length - 1] as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    await userEvent.setup().type(input, "123");
    expect(confirmButton.disabled).toBe(false);
    fireEvent.click(confirmButton);
  });

  test("アンマウントでスキャンを停止する", async () => {
    state.devices = [{ deviceId: "cam-1", label: "Back Camera" }];

    const { unmount } = renderScanner();

    await waitFor(() => expect(state.lastCallback).not.toBeNull());

    unmount();
    expect(state.stopCount).toBeGreaterThan(0);
  });
});
