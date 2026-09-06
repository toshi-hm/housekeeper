import type { Meta, StoryObj } from "@storybook/react";
import { fn, spyOn } from "storybook/test";

import { ShelfScanCamera } from "./ShelfScanCamera";

const meta = {
  component: ShelfScanCamera,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onCapture: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ShelfScanCamera>;

export default meta;
type Story = StoryObj<typeof meta>;

// BarcodeScanner.stories.tsxと同じ方針: navigator.mediaDevicesの実呼び出しは
// CI環境に実カメラが無いため、常にモックする。

export const Default: Story = {
  beforeEach() {
    // Never resolves → component stays in "カメラを起動中..." state for stable VRT
    spyOn(navigator.mediaDevices, "enumerateDevices").mockReturnValue(new Promise(() => {}));
  },
};

export const MultipleDevices: Story = {
  beforeEach() {
    spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([
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
    // getUserMedia never resolves → stays in starting state, switch button visible
    spyOn(navigator.mediaDevices, "getUserMedia").mockReturnValue(new Promise(() => {}));
  },
};

export const CameraError: Story = {
  beforeEach() {
    spyOn(navigator.mediaDevices, "enumerateDevices").mockRejectedValue(
      new Error("Permission denied"),
    );
  },
};
