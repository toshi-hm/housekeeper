import { render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";

const toCanvasMock = mock(() => Promise.resolve());

mock.module("qrcode", () => ({
  default: { toCanvas: toCanvasMock },
}));

const { TotpQrCode } = await import("./TotpQrCode");

describe("TotpQrCode", () => {
  it("renders a canvas with an accessible label", () => {
    const { getByRole } = render(
      <TotpQrCode uri="otpauth://totp/Housekeeper:user@example.com?secret=ABC" label="QR code" />,
    );

    expect(getByRole("img", { name: "QR code" })).not.toBeNull();
  });

  it("draws the QR code using the provided otpauth URI", () => {
    toCanvasMock.mockClear();
    render(<TotpQrCode uri="otpauth://totp/test?secret=XYZ" />);

    expect(toCanvasMock).toHaveBeenCalledWith(
      expect.anything(),
      "otpauth://totp/test?secret=XYZ",
      expect.objectContaining({ width: 200 }),
    );
  });
});
