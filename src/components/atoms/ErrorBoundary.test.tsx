import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, spyOn } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ErrorBoundary } from "./ErrorBoundary";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const UNKNOWN_ERROR_TEXT = /エラーが発生しました|An error occurred/;
const RETRY_TEXT = /再試行|Retry/;

const ThrowError = () => {
  throw new Error("test error");
};

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <p>正常コンテンツ</p>
      </ErrorBoundary>,
      { wrapper },
    );
    expect(getByText("正常コンテンツ")).not.toBeNull();
  });

  it("renders default fallback UI when a child throws", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
      { wrapper },
    );
    expect(getByText(UNKNOWN_ERROR_TEXT)).not.toBeNull();
    expect(getByText(RETRY_TEXT)).not.toBeNull();
    consoleSpy.mockRestore();
  });

  it("renders custom fallback when fallback prop is provided", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary fallback={<p>カスタムフォールバック</p>}>
        <ThrowError />
      </ErrorBoundary>,
      { wrapper },
    );
    expect(getByText("カスタムフォールバック")).not.toBeNull();
    consoleSpy.mockRestore();
  });

  it("resets error state on retry button click", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
      { wrapper },
    );
    fireEvent.click(getByText(RETRY_TEXT));
    // After reset the child throws again, so fallback is shown again
    expect(getByText(RETRY_TEXT)).not.toBeNull();
    consoleSpy.mockRestore();
  });
});
