import type { Meta, StoryObj } from "@storybook/react";

import { itemTypeTabId, itemTypeTabPanelId } from "@/lib/itemType";

import { ItemTypeTabs } from "./ItemTypeTabs";

const meta = {
  component: ItemTypeTabs,
  tags: ["autodocs"],
  /**
   * 選択中タブの `aria-controls` が指す tabpanel も、実画面（ダッシュボード）と
   * 同じように併せて描画する。タブ単体だと axe の `aria-valid-attr-value`
   * （critical）違反になる — 未選択タブの参照先は遅延描画とみなされ許容されるが、
   * 選択中タブのパネルは実在している必要があるため。
   */
  render: (args) => (
    <div className="space-y-2">
      <ItemTypeTabs {...args} />
      <div
        id={itemTypeTabPanelId(args.value)}
        role="tabpanel"
        aria-labelledby={itemTypeTabId(args.value)}
        tabIndex={0}
        className="rounded-lg border p-3 text-sm text-muted-foreground"
      >
        Item list
      </div>
    </div>
  ),
} satisfies Meta<typeof ItemTypeTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {
  args: {
    value: "all",
    counts: { all: 42, food: 30, daily_goods: 12 },
    onChange: () => {},
  },
};

export const Food: Story = {
  args: {
    value: "food",
    counts: { all: 42, food: 30, daily_goods: 12 },
    onChange: () => {},
  },
};

export const DailyGoodsEmpty: Story = {
  args: {
    value: "daily_goods",
    counts: { all: 30, food: 30, daily_goods: 0 },
    onChange: () => {},
  },
};
