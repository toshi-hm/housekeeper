import type { Meta, StoryObj } from "@storybook/react";
import { AlertTriangle } from "lucide-react";

import { DashboardNotificationCenter } from "./DashboardNotificationCenter";

const meta = {
  component: DashboardNotificationCenter,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof DashboardNotificationCenter>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleChips = [
  {
    key: "urgent",
    icon: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
    text: "3件の在庫が期限切れまたは期限間近です",
  },
  {
    key: "lowStock",
    icon: <AlertTriangle className="h-4 w-4 text-orange-600" />,
    text: "2件の在庫が最低在庫数以下です",
  },
  {
    key: "stocktake",
    icon: <AlertTriangle className="h-4 w-4 text-blue-600" />,
    text: "1件のアイテムは在庫確認が必要です",
  },
];

export const Empty: Story = {
  args: {
    chips: [],
    children: <p>非表示（何もレンダリングされない）</p>,
  },
};

export const WithAlerts: Story = {
  args: {
    chips: sampleChips,
    children: (
      <div className="space-y-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
        既存のバナー内容がそのまま展開エリアに表示されます
      </div>
    ),
  },
};

export const SingleChip: Story = {
  args: {
    chips: [sampleChips[0]!],
    children: (
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
        期限バナーの内容
      </div>
    ),
  },
};
