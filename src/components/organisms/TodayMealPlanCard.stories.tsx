import type { Meta, StoryObj } from "@storybook/react";

import { withRouter } from "../../../.storybook/routerDecorator";
import { TodayMealPlanCard } from "./TodayMealPlanCard";

const meta = {
  component: TodayMealPlanCard,
  tags: ["autodocs"],
  decorators: [withRouter],
  parameters: { layout: "padded" },
} satisfies Meta<typeof TodayMealPlanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Supabaseへの実通信は行われず（Storybookにはライブ接続がない）ため、
// データ取得hookはエラー状態に倒れて読み込みエラー表示になる。
// UIの静的な構造・アクセシビリティ確認が目的（`WeeklyMealPlanner.stories.tsx` と同じ方針）。
export const Default: Story = {};
