import type { Meta, StoryObj } from "@storybook/react";
import { type ComponentProps, useState } from "react";

import { AutocompleteInput } from "./AutocompleteInput";

type Props = ComponentProps<typeof AutocompleteInput>;

const Controlled = ({
  initial,
  ...props
}: Omit<Props, "value" | "onValueChange"> & { initial: string }) => {
  const [value, setValue] = useState(initial);
  return <AutocompleteInput {...props} value={value} onValueChange={setValue} />;
};

const meta = {
  component: AutocompleteInput,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    value: "",
    onValueChange: () => {},
    suggestions: ["牛乳", "牛乳パック", "豆乳", "トマト", "ミニトマト", "食パン"],
    placeholder: "アイテム名",
  },
} satisfies Meta<typeof AutocompleteInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => <Controlled {...args} initial="" />,
};

export const WithInitialQuery: Story = {
  render: (args) => <Controlled {...args} initial="牛" autoFocus />,
};

export const NoSuggestions: Story = {
  render: (args) => <Controlled {...args} suggestions={[]} initial="" />,
};
