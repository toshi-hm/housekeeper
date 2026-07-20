import type { Meta, StoryObj } from "@storybook/react";

import { TotpQrCode } from "./TotpQrCode";

const meta = {
  component: TotpQrCode,
  tags: ["autodocs"],
} satisfies Meta<typeof TotpQrCode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    uri: "otpauth://totp/Housekeeper:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Housekeeper",
    label: "TOTP QR code",
  },
};
