import type { Meta, StoryObj } from "@storybook/react";

import { PullToRefresh } from "./PullToRefresh";

const meta = {
  component: PullToRefresh,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "タッチ端末で最上部から下に引っ張ると更新する。デスクトップのブラウザでは DevTools のタッチエミュレーションで確認できる。",
      },
    },
  },
} satisfies Meta<typeof PullToRefresh>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onRefresh: () => new Promise((resolve) => setTimeout(resolve, 1200)),
    children: (
      <ul className="space-y-2">
        {["牛乳", "卵", "食パン"].map((name) => (
          <li key={name} className="rounded-lg border p-3 text-sm">
            {name}
          </li>
        ))}
      </ul>
    ),
  },
};

export const Disabled: Story = {
  args: { ...Default.args, disabled: true },
};
