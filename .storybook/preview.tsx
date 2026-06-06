import type { Decorator, Preview } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "i18next";
import "../src/index.css";
import "../src/lib/i18n";
import { ToastProvider } from "../src/lib/toast";

// VRT を安定させるため Storybook では常に日本語で描画する
void i18n.changeLanguage("ja");

const withProviders: Decorator = (Story) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Story />
      </ToastProvider>
    </QueryClientProvider>
  );
};

const preview: Preview = {
  decorators: [withProviders],
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
