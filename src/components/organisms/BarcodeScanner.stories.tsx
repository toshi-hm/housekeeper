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
