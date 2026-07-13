import { expect, test } from "@playwright/test";

/**
 * 認証画面のスモーク E2E (#178 / #350)。
 * バックエンド未接続でも通る、ルーティング・フォーム描画・クライアント挙動を検証する。
 * ログイン後のフロー（在庫追加→消費→買い物リスト）はテスト用 Supabase を CI に
 * 用意した段階で e2e/ 配下に追加していく（playwright.config.ts 参照）。
 */
test.describe("認証フロー（スモーク）", () => {
  test("未ログインでトップへアクセスすると /login へリダイレクトされる", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Housekeeper")).toBeVisible();
  });

  test("ログインフォームが表示される", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeVisible();
  });

  test("パスワードの表示/非表示を切り替えられる", async ({ page }) => {
    await page.goto("/login");
    const password = page.locator("#password");
    await password.fill("secret-value");
    await expect(password).toHaveAttribute("type", "password");

    // パスワード欄に隣接するトグルボタン（目アイコン）をクリック
    await password.locator("xpath=following-sibling::button").click();
    await expect(password).toHaveAttribute("type", "text");
  });

  test("パスワードを忘れた場合のリンクから /forgot-password へ遷移する", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /forgot|パスワード/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });
});
