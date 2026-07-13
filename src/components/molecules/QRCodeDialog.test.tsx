import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";

mock.module("qrcode", () => ({
  default: { toCanvas: mock(() => Promise.resolve()) },
}));

const { QRCodeDialog } = await import("./QRCodeDialog");

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("QRCodeDialog", () => {
  it("escapes HTML special characters in title/value before writing the print window", () => {
    const originalOpen = window.open;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

    try {
      const writeMock = mock(() => {});
      const closeMock = mock(() => {});
      const fakeWindow = {
        document: { write: writeMock, close: closeMock },
      } as unknown as Window;
      window.open = mock(() => fakeWindow) as unknown as typeof window.open;

      HTMLCanvasElement.prototype.toDataURL = mock(() => "data:image/png;base64,fake");

      const { getByRole } = render(
        <QRCodeDialog
          value='"><img src=x onerror=alert(1)>'
          title="<script>alert('xss')</script>"
          onClose={() => {}}
        />,
        { wrapper },
      );

      fireEvent.click(getByRole("button", { name: /qrPrint|印刷|Print/i }));

      expect(writeMock).toHaveBeenCalledTimes(1);
      const written = writeMock.mock.calls[0]?.[0] as string;
      expect(written).not.toContain("<script>alert('xss')</script>");
      expect(written).not.toContain("<img src=x onerror=alert(1)>");
      expect(written).toContain("&lt;script&gt;");
      expect(written).toContain("&lt;img src=x onerror=alert(1)&gt;");
    } finally {
      window.open = originalOpen;
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    }
  });
});
