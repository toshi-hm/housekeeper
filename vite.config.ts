import path from "path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const isStorybook = process.env.STORYBOOK === "true";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    ...(isStorybook
      ? []
      : [
          VitePWA({
            registerType: "autoUpdate",
            strategies: "injectManifest",
            srcDir: "src",
            filename: "sw.ts",
            manifest: {
              name: "housekeeper",
              short_name: "housekeeper",
              description: "家の在庫管理アプリ",
              theme_color: "#ffffff",
              background_color: "#ffffff",
              display: "standalone",
              start_url: "/",
              icons: [
                {
                  src: "/favicon.svg",
                  sizes: "any",
                  type: "image/svg+xml",
                  purpose: "any",
                },
              ],
              shortcuts: [
                {
                  name: "在庫を追加",
                  short_name: "追加",
                  description: "新しい在庫アイテムを登録する",
                  url: "/items/new",
                  icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
                },
                {
                  name: "買い物リスト",
                  short_name: "リスト",
                  description: "買い物リストを開く",
                  url: "/shopping",
                  icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
                },
              ],
            },
            devOptions: {
              enabled: false,
            },
            injectManifest: {
              rollupFormat: "iife",
            },
          }),
        ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("node_modules/@zxing")) return "zxing";
          if (id.includes("node_modules/@supabase")) return "supabase";
          if (id.includes("node_modules/@tanstack/react-query")) return "query";
          if (
            id.includes("node_modules/@tanstack/react-router") ||
            id.includes("node_modules/@tanstack/router")
          )
            return "router";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom"))
            return "react-vendor";
          return undefined;
        },
      },
    },
  },
});
