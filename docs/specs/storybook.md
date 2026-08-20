# Storybook Spec

## Setup

- Storybook 10 (latest)
- @storybook/react-vite (Viteと統合)
- インストール: bun add -D storybook @storybook/react-vite

## Story作成ルール

### 対象

- atoms: 必須（全コンポーネント）
- molecules: 必須（全コンポーネント）
- organisms: 必須（全コンポーネント）
- templates: 任意（レイアウト確認用途のみ）
- pages: 対象外（routesで確認する）
- ui/ (shadcn): 対象外

### ファイル配置

コンポーネントと同階層に置く

```
src/components/
  atoms/
    ExpiryBadge.tsx
    ExpiryBadge.stories.tsx   # ← ここに置く
  molecules/
    ItemCard.tsx
    ItemCard.stories.tsx
  organisms/
    BarcodeScanner.tsx
    BarcodeScanner.stories.tsx
```

### Story記述規約

```tsx
// ExpiryBadge.stories.tsx の例
import type { Meta, StoryObj } from "@storybook/react";
import { ExpiryBadge } from "./ExpiryBadge";

const meta = {
  component: ExpiryBadge,
  tags: ["autodocs"], // 必須: ドキュメント自動生成
} satisfies Meta<typeof ExpiryBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

// Storyは状態ごとに網羅する
export const Fresh: Story = {
  args: { expiryDate: "2025-12-31" },
};

export const ExpiringSoon: Story = {
  args: { expiryDate: new Date(Date.now() + 2 * 86400000).toISOString() },
};

export const Expired: Story = {
  args: { expiryDate: "2020-01-01" },
};
```

### 命名規約

- Storyは英語
- Story名はコンポーネントの「状態」を表す（Default / Loading / Error / Empty など）
- Default Storyは必ず用意する

## Commands

- 起動: bun run storybook
- ビルド: bun run build-storybook
- アクセシビリティチェック + Visual Regression Testing: bun run test-storybook（ビルド済み
  Storybookに対して実行。同一コマンドで両方をチェックする。詳細は下記）

## package.json scripts（追加分）

```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build",
  "test-storybook": "test-storybook"
}
```

## アクセシビリティ回帰自動検出（axe-core）

Originating issue: [#497](https://github.com/toshi-hm/housekeeper/issues/497)。
`@storybook/addon-a11y`（Storybook UI上でのインタラクティブなa11yパネル）に加え、
`@storybook/test-runner` + `axe-playwright` で全`.stories.tsx`に対してaxe-coreの
ルールチェックをヘッドレス実行し、CI（`.github/workflows/_a11y.yml`、`ci.yml`から呼び出し）で
回帰を自動検出する。

### 仕組み

- `.storybook/test-runner.ts`: `preVisit`でaxeを注入し、`postVisit`で各Storyの
  DOM（`#storybook-root`）に対して`checkA11y`を実行する設定ファイル。
- ローカル実行手順:
  1. `bun run build-storybook`
  2. ビルド成果物（`storybook-static/`）を静的サーバで配信（例: `npx serve storybook-static -l 6006`）
  3. `bun run test-storybook -- --ci --url http://127.0.0.1:6006`
- CIでは`bunx playwright install --with-deps chromium`でブラウザを取得してから同じ手順を実行する。

### 段階導入方針（baseline）

初回導入時点で既存の全Storyにaxe-coreを強制すると、これまで検知されていなかった
違反で一斉に赤くなる可能性がある。そのため:

- 個別修正が容易な違反（`aria-label`不足など）はCIを赤くする前に直接修正する
  （baselineに載せない）。
- 修正にコンポーネント/マークアップ変更を要する違反は、Story ID
  （`<title-kebab>--<story-name-kebab>`形式、例: `atoms-expirybadge--expired`）を
  `.storybook/a11y-baseline.ts`の`A11Y_BASELINE`に列挙し、チェックをスキップする。
- **新規追加するStoryはbaselineに載せない**。新規Story分は最初から厳格にチェックされる。
- baselineのエントリは違反を修正したら削除する（残数を増やさない）。

個々の規約・既知のギャップは`docs/specs/accessibility.md`を参照。

## Visual Regression Testing (VRT)

Originating issue: [#807](https://github.com/toshi-hm/housekeeper/issues/807)。
タップターゲットサイズ・余白・色などの意図しない見た目の回帰を、レビュー前にPRで
機械検知する。axe-coreと同じ`@storybook/test-runner`のテストパス
（`.storybook/test-runner.ts`の`postVisit`）内で、各Storyのスクリーンショットを
`jest-image-snapshot`でcommitted baselineと比較する（`@storybook/test-runner`公式README
「Image snapshot」節のレシピに準拠）。a11yチェックと同一のStorybookビルド・サーブ・
テスト実行を共有し、専用のCIジョブ/ワークフローを別に追加していない
（`.github/workflows/_a11y.yml`に統合、#835のビルド重複回避方針に合わせている）。

### ツール選定

セルフホスト方針（本プロダクトはサーバー未使用のクライアントサイドのみの構成）との
整合、および外部SaaSアカウント（Chromatic等）への依存を避けるため、Chromatic等の
ホスティング型VRTではなく、既存の`@storybook/test-runner` + Playwrightで完結する
`jest-image-snapshot`を採用した。baseline画像はリポジトリに直接コミットする
（現状256枚・約4MB、Git LFS等の追加インフラは導入していない。将来Story数が大きく
増えてリポジトリサイズが問題になった場合に検討する）。

### 仕組み

- `.storybook/test-runner.ts`: `setup()`で`expect.extend({ toMatchImageSnapshot })`し、
  `postVisit`で`waitForPageReady`（フォント読み込み等の完了待ち）の後に
  `page.screenshot()`を撮り、`.storybook/__image_snapshots__/`のbaselineと比較する。
- 差分の許容: `failureThreshold: 0.02`（`failureThresholdType: "percent"`、差分ピクセル
  比率2%まで許容）。マシン間のフォントレンダリング・アンチエイリアシングの誤差を
  吸収するための閾値で、ピクセル完全一致は要求しない。
- 個別Storyの除外: `parameters.vrt.disable = true` を指定すると、そのStoryはVRT対象外
  になる（`parameters.a11y.disable`と同じパターン）。乱数・現在時刻依存など、本質的に
  非決定的な見た目を持つStoryのための逃げ道。
- ローカルでのbaseline生成/更新手順:
  1. `bun run build-storybook`
  2. ビルド成果物を静的サーバで配信（例: `npx serve storybook-static -l 6006`）
  3. `bun run test-storybook -- --url http://127.0.0.1:6006`（`--ci`を付けない）で
     実行すると、baselineが無いStoryのbaselineを新規作成し、既存baselineと差分がある
     Storyのbaselineを上書きする
  4. 生成/更新された`.storybook/__image_snapshots__/**/*.png`の差分をレビューし、
     意図した変更であることを確認してからコミットする
  5. `bun run test-storybook -- --ci --url http://127.0.0.1:6006`（`--ci`付き）で
     再実行し、クリーンにpassすることを確認する（`--ci`はbaseline未生成時に失敗させる
     モードで、CIと同じ動作を再現できる）
- CI失敗時: 差分が出たテストの`__diff_output__/`配下の画像（before/after/diff）を
  `.github/workflows/_a11y.yml`の`Upload visual regression diffs`ステップでartifact
  としてアップロードする。

### 既知の制約

- このサンドボックス環境ではPlaywrightのブラウザキャッシュと`@storybook/test-runner`が
  要求するバージョンにずれがあり、baseline生成時のみローカルの
  `executablePath`上書き（一時的なeject configで対応、コミットには含めない）が必要
  だった。GitHub Actions上の実CIでは`bunx playwright install --with-deps chromium`で
  毎回バージョンが揃うため、この問題は発生しない想定（既存のa11yチェックと同じCI
  ステップを共有しているため）。
- スクリーンショットは各Storyの初期表示状態のみを対象とする（`play`関数によるインタ
  ラクション後の状態や、ホバー/フォーカス状態のスクリーンショットは対象外）。
