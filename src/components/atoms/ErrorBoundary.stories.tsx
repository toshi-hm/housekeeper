import type { Meta, StoryObj } from "@storybook/react";

import { ErrorBoundary } from "./ErrorBoundary";

const ThrowError = () => {
  throw new Error("Story: simulated render error");
};

const meta = {
  component: ErrorBoundary,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { children: null },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ErrorBoundary>
      <p className="p-4 text-sm">正常に描画されるコンテンツ</p>
    </ErrorBoundary>
  ),
};

export const WithError: Story = {
  render: () => (
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  ),
};

export const WithCustomFallback: Story = {
  render: () => (
    <ErrorBoundary
      fallback={
        <div className="rounded border border-destructive p-4 text-sm text-destructive">
          カスタムフォールバック
        </div>
      }
    >
      <ThrowError />
    </ErrorBoundary>
  ),
};
