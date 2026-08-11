import type { Meta, StoryObj } from "@storybook/react";

import { ThreeDFloorPlanViewer } from "./ThreeDFloorPlanViewer";

const meta = {
  component: ThreeDFloorPlanViewer,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ThreeDFloorPlanViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    document: {
      schemaVersion: 1,
      units: "cm",
      width: 600,
      height: 400,
      gridSize: 10,
      walls: [{ id: "wall-1", start: { x: 50, y: 50 }, end: { x: 550, y: 50 }, thickness: 8 }],
      shapes: [
        {
          id: "shape-1",
          kind: "rectangle",
          x: 120,
          y: 100,
          width: 180,
          height: 100,
          rotation: 0,
          label: "棚",
        },
      ],
    },
  },
};
