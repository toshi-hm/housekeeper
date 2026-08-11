import type { Meta, StoryObj } from "@storybook/react";

import { createEmptyFloorPlanDocument } from "@/types/floorPlan";

import { FloorPlanEditor } from "./FloorPlanEditor";

const meta = {
  component: FloorPlanEditor,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof FloorPlanEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialDocument: createEmptyFloorPlanDocument(),
    onSave: () => undefined,
  },
};

export const Saving: Story = {
  args: {
    initialDocument: createEmptyFloorPlanDocument(),
    onSave: () => undefined,
    isSaving: true,
  },
};
