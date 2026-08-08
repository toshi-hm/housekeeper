import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ImageUploader } from "./ImageUploader";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

// `size` is stubbed via defineProperty rather than backing the File with a
// real oversized buffer, so the too-large-file test doesn't have to
// allocate tens of MB just to trip the MAX_RAW_SIZE_BYTES check.
const createFile = (name: string, type: string, sizeBytes: number) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
};

describe("ImageUploader", () => {
  it("renders no error initially", () => {
    const { queryByRole } = render(<ImageUploader onFile={() => {}} />, { wrapper });

    expect(queryByRole("alert")).toBeNull();
  });

  it("shows an aria-live error and describes the trigger button on an unsupported type", () => {
    const { container, getByRole } = render(<ImageUploader onFile={() => {}} />, { wrapper });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [createFile("a.gif", "image/gif", 100)] } });

    const alert = getByRole("alert");
    expect(alert.id).not.toBe("");
    const captureButton = getByRole("button", { name: /撮影|Take Photo/i });
    expect(captureButton.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("does not call onFile when validation fails", () => {
    let called = false;
    const { container } = render(<ImageUploader onFile={() => (called = true)} />, { wrapper });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [createFile("big.png", "image/png", 40 * 1024 * 1024)] },
    });

    expect(called).toBe(false);
  });
});
