import type { Meta, StoryObj } from "@storybook/react";

import type { OfflineQueuedAction } from "@/lib/offlineActionQueue";
import type { ItemFormValues } from "@/types/item";

import { OfflineQueuePanel } from "./OfflineQueuePanel";

const makeFormValues = (name: string): ItemFormValues =>
  ({
    name,
    barcode: "",
    category_id: null,
    storage_location_id: null,
    units: 1,
    content_amount: 1,
    content_unit: "個",
    opened_remaining: null,
    purchase_date: "",
    expiry_date: "",
    notes: "",
    image_path: "",
  }) as ItemFormValues;

const purchaseAction = (id: string, name: string): OfflineQueuedAction => ({
  id,
  kind: "purchase",
  payload: { shoppingItemId: id, itemValues: makeFormValues(name), applyMergeFields: false },
  queuedAt: new Date().toISOString(),
});

const addAlertAction = (id: string, name: string): OfflineQueuedAction => ({
  id,
  kind: "add-alert",
  payload: { name, linked_item_id: id },
  queuedAt: new Date().toISOString(),
});

const meta = {
  component: OfflineQueuePanel,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    onRequestDiscard: () => {},
  },
} satisfies Meta<typeof OfflineQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    actions: [],
  },
};

export const SingleAction: Story = {
  args: {
    actions: [purchaseAction("1", "牛乳")],
  },
};

export const MixedActions: Story = {
  args: {
    actions: [
      purchaseAction("1", "牛乳"),
      addAlertAction("2", "卵"),
      purchaseAction("3", "食パン"),
    ],
  },
};
