import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { LocationPinPicker } from "./LocationPinPicker";

const PHOTO_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-size='20'%3EStorage photo%3C/text%3E%3C/svg%3E";

const InteractiveWrapper = (props: React.ComponentProps<typeof LocationPinPicker>) => {
  const [value, setValue] = useState(props.value);
  return <LocationPinPicker {...props} value={value} onChange={setValue} />;
};

const meta = {
  component: LocationPinPicker,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof LocationPinPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { photoUrl: PHOTO_URL, value: null, onChange: () => {} },
};

export const WithExistingPins: Story = {
  args: {
    photoUrl: PHOTO_URL,
    existingPins: [
      { id: "1", x: 0.2, y: 0.3, label: "牛乳" },
      { id: "2", x: 0.7, y: 0.6, label: "卵" },
    ],
    value: null,
    onChange: () => {},
  },
};

export const Interactive: Story = {
  render: (args) => <InteractiveWrapper {...args} />,
  args: {
    photoUrl: PHOTO_URL,
    existingPins: [{ id: "1", x: 0.2, y: 0.3, label: "牛乳" }],
    value: { x: 0.5, y: 0.5 },
    onChange: () => {},
  },
};
