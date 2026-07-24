import type { Meta, StoryObj } from "@storybook/react";
import * as ZxingBrowser from "@zxing/browser";
import { fn, spyOn } from "storybook/test";
import * as Tesseract from "tesseract.js";

import { ExpiryDateScanner } from "./ExpiryDateScanner";

const meta = {
  component: ExpiryDateScanner,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onConfirm: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ExpiryDateScanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach() {
    // Never resolves → component stays in "Starting camera…" state for stable VRT
    spyOn(ZxingBrowser.BrowserMultiFormatReader, "listVideoInputDevices").mockReturnValue(
      new Promise(() => {}),
    );
  },
};

/**
 * カメラ起動済みで「撮影する」ボタンを押せる状態。
 * tesseract.js の OCR 呼び出しは Storybook 上で実ネットワーク/実CPUを使わないよう
 * createWorker をモックし、常に固定の認識結果を返すようにしている。
 *
 * `!test` タグで @storybook/test-runner（CI の a11y ジョブ）の対象から除外している:
 * `Tesseract.createWorker` はビルド後の ES module namespace 上では再定義不可の
 * named export で、test-runner がこの story を複数回訪問すると2回目の `spyOn` が
 * "Cannot redefine property" で例外になる。VRT（Chromatic）や `storybook dev` での
 * 手動確認は引き続き有効。
 */
export const CameraReady: Story = {
  tags: ["!test"],
  beforeEach() {
    spyOn(ZxingBrowser.BrowserMultiFormatReader, "listVideoInputDevices").mockResolvedValue([]);
    spyOn(
      ZxingBrowser.BrowserMultiFormatReader.prototype,
      "decodeFromVideoDevice",
    ).mockResolvedValue({ stop: () => undefined });
    spyOn(Tesseract, "createWorker").mockResolvedValue({
      setParameters: async () => ({ jobId: "mock", data: {} }),
      recognize: async () => ({
        jobId: "mock",
        data: { text: "賞味期限 25.12.31" },
      }),
      terminate: async () => ({ jobId: "mock", data: {} }),
      // 未使用のWorkerメソッドはStory上では呼ばれない
    } as unknown as Tesseract.Worker);
  },
};

export const MultipleDevices: Story = {
  beforeEach() {
    spyOn(ZxingBrowser.BrowserMultiFormatReader, "listVideoInputDevices").mockResolvedValue([
      {
        deviceId: "camera-front",
        label: "Front Camera",
        kind: "videoinput",
        groupId: "",
      } as MediaDeviceInfo,
      {
        deviceId: "camera-back",
        label: "Back Camera (environment)",
        kind: "videoinput",
        groupId: "",
      } as MediaDeviceInfo,
    ]);
    // decodeFromVideoDevice never resolves → stays in starting state, switch button visible
    spyOn(ZxingBrowser.BrowserMultiFormatReader.prototype, "decodeFromVideoDevice").mockReturnValue(
      new Promise(() => {}),
    );
  },
};

export const CameraError: Story = {
  beforeEach() {
    spyOn(ZxingBrowser.BrowserMultiFormatReader, "listVideoInputDevices").mockRejectedValue(
      new Error("Permission denied"),
    );
  },
};
