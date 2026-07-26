import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

const stopMock = mock(() => undefined);
let resolveDecode: ((controls: { stop: () => void }) => void) | null = null;
let deferDecode = false;
const decodeFromVideoDeviceMock = mock(() => {
  if (deferDecode) {
    return new Promise<{ stop: () => void }>((resolve) => {
      resolveDecode = resolve;
    });
  }
  return Promise.resolve({ stop: stopMock });
});

mock.module("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    static listVideoInputDevices = mock(() => Promise.resolve([]));
    decodeFromVideoDevice = decodeFromVideoDeviceMock;
  },
}));

const { ExpiryDateScanner } = await import("./ExpiryDateScanner");

describe("ExpiryDateScanner", () => {
  test("カメラ取得中にアンマウントされた場合、取得完了後にストリームが停止される（#651）", async () => {
    deferDecode = true;
    const onConfirm = mock(() => undefined);
    const onClose = mock(() => undefined);
    const lateStopMock = mock(() => undefined);

    let unmount!: () => void;
    await act(async () => {
      const result = render(
        <I18nextProvider i18n={i18n}>
          <ExpiryDateScanner onConfirm={onConfirm} onClose={onClose} />
        </I18nextProvider>,
      );
      unmount = result.unmount;
    });

    act(() => {
      unmount();
    });

    await act(async () => {
      resolveDecode?.({ stop: lateStopMock });
      await Promise.resolve();
    });

    expect(lateStopMock).toHaveBeenCalled();
    deferDecode = false;
  });

  test("StrictModeのマウント→アンマウント→再マウント後もカメラが起動状態に到達する（#651の修正の回帰防止）", async () => {
    const onConfirm = mock(() => undefined);
    const onClose = mock(() => undefined);

    const { queryByText } = await act(async () => {
      return render(
        <StrictMode>
          <I18nextProvider i18n={i18n}>
            <ExpiryDateScanner onConfirm={onConfirm} onClose={onClose} />
          </I18nextProvider>
        </StrictMode>,
      );
    });

    await waitFor(() => expect(queryByText("カメラを起動中...")).toBeNull());
  });
});
