import path from "path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import type { ManifestOptions } from "vite-plugin-pwa";

const isStorybook = process.env.STORYBOOK === "true";

/**
 * PWA Web App Widgets（実験的機能, #367）の manifest 拡張フィールド。
 * vite-plugin-pwa の ManifestOptions 型（workbox 由来）はまだ widgets を
 * 認識しないため、型を拡張してマージする。
 * 詳細: docs/specs/features/pwa.md
 */
interface WidgetIcon {
  src: string;
  sizes: string;
  type?: string;
}

interface WidgetDefinition {
  name: string;
  short_name?: string;
  description?: string;
  tag: string;
  template: string;
  ms_ac_template: string;
  data: string;
  type: string;
  auth?: boolean;
  update?: number;
  icons?: WidgetIcon[];
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const supabaseUrl = env.VITE_SUPABASE_URL;

  // widget の data は Supabase Edge Function（widget-data）を直接指す。
  // ブラウザの CORS 制約は同一オリジン外への XHR/fetch にのみ適用され、OS の
  // ウィジェットホストが行う取得はブラウザの CORS 対象外だが、Edge Function 側は
  // 他の関数と同様に Access-Control-Allow-Origin を返す（将来ブラウザ内プレビュー等
  // から叩かれても問題ないように）。VITE_SUPABASE_URL 未設定時（CI 等）は widgets
  // フィールド自体を省略する。
  const widgets: WidgetDefinition[] = supabaseUrl
    ? [
        {
          name: "在庫アラート",
          short_name: "在庫アラート",
          description: "期限切れ・低在庫の件数と主要アイテムを確認できます（実験的機能）",
          tag: "inventory-alert",
          template: "inventory-alert",
          ms_ac_template: "/widgets/templates/inventory-alert.json",
          data: `${supabaseUrl}/functions/v1/widget-data`,
          type: "application/json",
          auth: true,
          update: 3600,
          icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
        },
      ]
    : [];

  const manifest: Partial<ManifestOptions> & { widgets?: WidgetDefinition[] } = {
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
    ...(widgets.length > 0 ? { widgets } : {}),
  };

  return {
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
              manifest,
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
  };
});
