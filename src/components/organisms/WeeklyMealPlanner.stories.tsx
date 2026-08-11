import type { Meta, StoryObj } from "@storybook/react";

import { WeeklyMealPlanner } from "./WeeklyMealPlanner";

const meta = {
  component: WeeklyMealPlanner,
  tags: ["autodocs"],
} satisfies Meta<typeof WeeklyMealPlanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Supabaseへの実通信は行われず（Storybookにはライブ接続がない）、
// 各データ取得hookはエラー状態に倒れて読み込みエラー表示になる。
// UIの静的な構造・アクセシビリティ確認が目的（`DataExportPanel.stories.tsx` と同じ方針）。
export const Default: Story = {};
