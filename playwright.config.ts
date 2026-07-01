import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E テスト設定 (#178 / #350)。
 * Vite dev サーバを `--mode test` で起動し、.env.test の値を読み込む。
 * バックエンド（Supabase）は未接続でも動作する認証フロー入口のスモークを対象とする。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // ローカルでプリインストール済み Chromium を使う場合に上書きする
        // （CI ではワークフローが `playwright install` するため未設定）
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: {
    command: `bunx vite --mode test --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
