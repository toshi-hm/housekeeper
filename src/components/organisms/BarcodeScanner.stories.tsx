import type { Meta, StoryObj } from "@storybook/react";
import * as ZxingBrowser from "@zxing/browser";
import { fn, spyOn } from "storybook/test";

import { BarcodeScanner } from "./BarcodeScanner";

const meta = {
  component: BarcodeScanner,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onScan: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BarcodeScanner>;

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
