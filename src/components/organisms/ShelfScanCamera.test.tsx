import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ShelfScanCamera } from "./ShelfScanCamera";

const fakeVideoDevice = (id: string, label: string): MediaDeviceInfo =>
  ({ deviceId: id, label, kind: "videoinput", groupId: "" }) as MediaDeviceInfo;

// happy-domのsrcObjectセッターは`instanceof MediaStream`を検証するため、実際の
// MediaStreamインスタンス（happy-domのグローバル、getTracksは未実装）を土台に
// する必要がある。
const fakeStream = (): MediaStream => {
  const stream = new MediaStream();
  Object.defineProperty(stream, "getTracks", {
    value: () => [{ stop: mock(() => undefined) }],
  });
  return stream;
};

describe("ShelfScanCamera", () => {
  afterEach(() => {
    mock.restore();
    // @ts-expect-error test-only cleanup of a happy-dom global not reset between tests
    delete navigator.mediaDevices;
  });

  test("カメラ非対応環境ではエラー表示になり、ライブラリから選択できる（フォールバック）", async () => {
    // navigator.mediaDevices が無い環境（happy-domのデフォルト）をそのまま利用する。
    const onCapture = mock(() => undefined);
    const onClose = mock(() => undefined);

    const { getByText, getAllByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ShelfScanCamera onCapture={onCapture} onClose={onClose} />
      </I18nextProvider>,
    );

    await waitFor(() =>
      expect(getByText(i18n.t("cameraError", { ns: "shelfScan" }))).toBeDefined(),
    );
    // ヘッダーのアイコンボタンとエラー状態内のボタン、2つとも同じ
    // accessible name を持つため、getAllByRoleで両方存在することだけ確認する。
    expect(
      getAllByRole("button", { name: i18n.t("pickFromLibrary", { ns: "shelfScan" }) }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("撮影に失敗した場合はエラーメッセージとリトライ・ライブラリ導線を表示する", async () => {
    // @ts-expect-error assigning a partial mock for test purposes
    navigator.mediaDevices = {
      enumerateDevices: mock(() => Promise.reject(new Error("Permission denied"))),
    };
    const onCapture = mock(() => undefined);
    const onClose = mock(() => undefined);

    const { getByText, getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ShelfScanCamera onCapture={onCapture} onClose={onClose} />
      </I18nextProvider>,
    );

    await waitFor(() => expect(getByText("Permission denied")).toBeDefined());
    expect(getByRole("button", { name: i18n.t("retry", { ns: "common" }) })).toBeDefined();
  });

  test("カメラが複数ある場合は切替ボタンが表示され、押すと別デバイスで再起動する", async () => {
    const devices = [
      fakeVideoDevice("cam-1", "Front Camera"),
      fakeVideoDevice("cam-2", "Back Camera"),
    ];
    const getUserMediaMock = mock(() => Promise.resolve(fakeStream()));
    // @ts-expect-error assigning a partial mock for test purposes
    navigator.mediaDevices = {
      enumerateDevices: mock(() => Promise.resolve(devices)),
      getUserMedia: getUserMediaMock,
    };
    // happy-dom's HTMLMediaElement.play() throws "not implemented" — swallow it
    // the same way the component itself already handles a rejecting play().
    HTMLMediaElement.prototype.play = mock(() => Promise.resolve());

    const onCapture = mock(() => undefined);
    const onClose = mock(() => undefined);

    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ShelfScanCamera onCapture={onCapture} onClose={onClose} />
      </I18nextProvider>,
    );

    const switchButton = await waitFor(() =>
      getByRole("button", { name: i18n.t("switchCamera", { ns: "shelfScan" }) }),
    );
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);

    fireEvent.click(switchButton);
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(2));
  });

  test("閉じるボタンでonCloseが呼ばれる", async () => {
    const onCapture = mock(() => undefined);
    const onClose = mock(() => undefined);

    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ShelfScanCamera onCapture={onCapture} onClose={onClose} />
      </I18nextProvider>,
    );

    await waitFor(() =>
      expect(getByRole("button", { name: i18n.t("close", { ns: "common" }) })).toBeDefined(),
    );
    fireEvent.click(getByRole("button", { name: i18n.t("close", { ns: "common" }) }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("ライブラリから選択すると、選んだファイルでonCaptureが呼ばれる", async () => {
    const onCapture = mock(() => undefined);
    const onClose = mock(() => undefined);

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <ShelfScanCamera onCapture={onCapture} onClose={onClose} />
      </I18nextProvider>,
    );

    // ファイル入力は撮影状態に関わらず常に描画されている（カメラ非対応/エラー時の
    // フォールバック経路のため）。
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["dummy-image-bytes"], "shelf.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture).toHaveBeenCalledWith(file);
  });

  describe("撮影ボタン(shutter)", () => {
    let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
    let originalToBlob: typeof HTMLCanvasElement.prototype.toBlob;

    beforeEach(() => {
      originalGetContext = HTMLCanvasElement.prototype.getContext;
      originalToBlob = HTMLCanvasElement.prototype.toBlob;
    });

    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    });

    test("撮影ボタンを押すと現在のフレームをcanvasに描画し、生成したファイルでonCaptureが呼ばれる", async () => {
      const devices = [fakeVideoDevice("cam-1", "Back Camera (environment)")];
      // @ts-expect-error assigning a partial mock for test purposes
      navigator.mediaDevices = {
        enumerateDevices: mock(() => Promise.resolve(devices)),
        getUserMedia: mock(() => Promise.resolve(fakeStream())),
      };
      HTMLMediaElement.prototype.play = mock(() => Promise.resolve());

      // videoWidth/videoHeight are read-only getters on real browsers; happy-dom
      // allows overriding them directly on the instance via defineProperty.
      Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
        configurable: true,
        get: () => 640,
      });
      Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
        configurable: true,
        get: () => 480,
      });

      const drawImageMock = mock(() => undefined);
      // @ts-expect-error partial 2D context mock, enough for handleShutter's usage
      HTMLCanvasElement.prototype.getContext = mock(() => ({ drawImage: drawImageMock }));
      const fakeBlob = new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" });
      HTMLCanvasElement.prototype.toBlob = mock(function (
        this: HTMLCanvasElement,
        callback: BlobCallback,
      ) {
        callback(fakeBlob);
      }) as typeof HTMLCanvasElement.prototype.toBlob;

      const onCapture = mock(() => undefined);
      const onClose = mock(() => undefined);

      const { getByRole } = render(
        <I18nextProvider i18n={i18n}>
          <ShelfScanCamera onCapture={onCapture} onClose={onClose} />
        </I18nextProvider>,
      );

      const shutterButton = await waitFor(() => {
        const button = getByRole("button", {
          name: i18n.t("shutter", { ns: "shelfScan" }),
        }) as HTMLButtonElement;
        // startCamera()の完了(isStarting=false)を待たないと撮影ボタンはdisabledのまま。
        expect(button.disabled).toBe(false);
        return button;
      });
      await act(async () => {
        fireEvent.click(shutterButton);
      });

      expect(drawImageMock).toHaveBeenCalled();
      expect(onCapture).toHaveBeenCalledTimes(1);
      const capturedFile = onCapture.mock.calls[0]?.[0] as File;
      expect(capturedFile.type).toBe("image/jpeg");
      expect(capturedFile.name).toBe("shelf-scan.jpg");
    });
  });
});
