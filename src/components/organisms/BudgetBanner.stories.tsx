import type { Meta, StoryObj } from "@storybook/react";

import { BudgetBanner, BudgetBannerView } from "./BudgetBanner";

const meta = {
  component: BudgetBannerView,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof BudgetBannerView>;

export default meta;
type Story = StoryObj<typeof meta>;

// 80%未満: 通常表示（secondary）
export const Normal: Story = {
  args: {
    status: { monthlyBudget: 30000, currentSpend: 15000, percentUsed: 50, tier: "normal" },
  },
};

// 80%以上100%未満: 注意表示（warning）
export const Caution: Story = {
  args: {
    status: { monthlyBudget: 30000, currentSpend: 25500, percentUsed: 85, tier: "caution" },
  },
};

// 100%以上: 警告表示（destructive、予算超過）
export const Over: Story = {
  args: {
    status: { monthlyBudget: 30000, currentSpend: 39000, percentUsed: 130, tier: "over" },
  },
};

// Storybook環境ではsupabaseがモック化され未認証扱いになり、useBudgetStatusは
// monthly_budgetを読めず status: null を返すため、実データ取得を担う
// BudgetBanner（container）は何も表示しない。予算未設定ユーザーへの
// 影響ゼロという仕様どおりの状態。
export const Hidden: Story = {
  args: { status: { monthlyBudget: 30000, currentSpend: 0, percentUsed: 0, tier: "normal" } },
  render: () => <BudgetBanner />,
};
