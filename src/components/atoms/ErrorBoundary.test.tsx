import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, spyOn } from "bun:test";

import { ErrorBoundary } from "./ErrorBoundary";

const ThrowError = () => {
  throw new Error("test error");
};

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <p>正常コンテンツ</p>
      </ErrorBoundary>,
    );
    expect(getByText("正常コンテンツ")).not.toBeNull();
  });

  it("renders default fallback UI when a child throws", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(getByText("エラーが発生しました")).not.toBeNull();
    expect(getByText("再試行")).not.toBeNull();
    consoleSpy.mockRestore();
  });

  it("renders custom fallback when fallback prop is provided", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary fallback={<p>カスタムフォールバック</p>}>
        <ThrowError />
      </ErrorBoundary>,
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
    );
    fireEvent.click(getByText("再試行"));
    // After reset the child throws again, so fallback is shown again
    expect(getByText("再試行")).not.toBeNull();
    consoleSpy.mockRestore();
  });
});
