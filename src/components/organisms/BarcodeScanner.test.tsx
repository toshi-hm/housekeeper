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
const decodeFromVideoDeviceMock = mock(
  (_deviceId: string | undefined, _video: HTMLVideoElement, callback: DecodeCallback) => {
    capturedCallback = callback;
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
});
