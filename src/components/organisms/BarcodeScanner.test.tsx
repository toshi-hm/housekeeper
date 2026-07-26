import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

type DecodeCallback = (
  result: { getText: () => string } | undefined,
  err: Error | undefined,
) => void;

const stopMock = mock(() => undefined);
let capturedCallback: DecodeCallback | null = null;
let resolveDecode: ((controls: { stop: () => void }) => void) | null = null;
let deferDecode = false;
const decodeFromVideoDeviceMock = mock(
  (_deviceId: string | undefined, _video: HTMLVideoElement, callback: DecodeCallback) => {
    capturedCallback = callback;
    if (deferDecode) {
      return new Promise<{ stop: () => void }>((resolve) => {
        resolveDecode = resolve;
      });
    }
    return Promise.resolve({ stop: stopMock });
  },
);

mock.module("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    static listVideoInputDevices = mock(() => Promise.resolve([]));
    decodeFromVideoDevice = decodeFromVideoDeviceMock;
  },
}));

const { BarcodeScanner } = await import("./BarcodeScanner");

describe("BarcodeScanner", () => {
  test("同一バーコードの連続検出でもonScanは1回だけ呼ばれ、検出後にstopが呼ばれる", async () => {
    const onScan = mock(() => undefined);
    const onClose = mock(() => undefined);

    await act(async () => {
      render(
        <I18nextProvider i18n={i18n}>
          <BarcodeScanner onScan={onScan} onClose={onClose} />
        </I18nextProvider>,
      );
    });

    await waitFor(() => expect(capturedCallback).not.toBeNull());

    act(() => {
      capturedCallback?.({ getText: () => "4901234567894" }, undefined);
      capturedCallback?.({ getText: () => "4901234567894" }, undefined);
      capturedCallback?.({ getText: () => "4901234567894" }, undefined);
    });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("4901234567894");
    expect(stopMock).toHaveBeenCalled();
  });

  test("カメラ取得中にアンマウントされた場合、取得完了後にストリームが停止される（#651）", async () => {
    deferDecode = true;
    const onScan = mock(() => undefined);
    const onClose = mock(() => undefined);
    const lateStopMock = mock(() => undefined);

    let unmount!: () => void;
    await act(async () => {
      const result = render(
        <I18nextProvider i18n={i18n}>
          <BarcodeScanner onScan={onScan} onClose={onClose} />
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
});
