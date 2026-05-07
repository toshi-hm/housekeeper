import type { Meta, StoryObj } from "@storybook/react";

import { ProductLookupResult } from "./ProductLookupResult";

const meta = {
  component: ProductLookupResult,
  tags: ["autodocs"],
} satisfies Meta<typeof ProductLookupResult>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { isLoading: true, product: undefined },
};

export const Found: Story = {
  args: {
    isLoading: false,
    product: {
      name: "明治ブルガリアヨーグルト LB81 プレーン 450g",
      brand: "明治",
      description: "乳酸菌LB81を使用した、なめらかでコクのある味わいのプレーンヨーグルトです。",
      image_url: "https://placehold.co/64x64?text=YG",
    },
  },
};

export const FoundNoImage: Story = {
  args: {
    isLoading: false,
    product: {
      name: "カルビー ポテトチップス うすしお味 60g",
      brand: "カルビー",
      description: undefined,
      image_url: undefined,
    },
  },
};

export const NotFound: Story = {
  args: { isLoading: false, product: null },
};

export const Idle: Story = {
  args: { isLoading: false, product: undefined },
};
