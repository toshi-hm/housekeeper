import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { StorybookConfig } from "@storybook/react-vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  staticDirs: ["../public"],
  viteFinal: async (config) => {
    const { mergeConfig } = await import("vite");
    // PWA plugin causes build errors in Storybook (sb-manager files exceed 2MB cache limit)
    config.plugins = (config.plugins ?? []).filter((plugin) => {
      if (!plugin || typeof plugin !== "object" || !("name" in plugin)) return true;
      return !String(plugin.name).startsWith("vite-plugin-pwa");
    });
    return mergeConfig(config, {
      resolve: {
        alias: [
          {
            find: "@/lib/supabase",
            replacement: resolve(__dirname, "../src/mocks/supabase.ts"),
          },
          { find: "@", replacement: resolve(__dirname, "../src") },
        ],
      },
    });
  },
};

export default config;
