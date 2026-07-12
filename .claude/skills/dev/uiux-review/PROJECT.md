# PROJECT.md — uiux-review（housekeeper 固有設定）

このファイルは housekeeper リポジトリ専用の設定。SKILL.md の一般論より **こちらを優先** する。
他リポジトリへ持ち出す場合はこのファイルを削除するか、移植先の値で書き直すこと。

## 利用文脈（レビューの最優先軸）

- **スマホ片手操作が主戦場**。キッチン（濡れた手・調理中）と買い物中（歩きながら）で使う
- 単一ユーザーの家庭内在庫管理。業務システム的な情報密度より、即座の操作性を優先する
- 主要アクション = 消費（使った）・追加・バーコードスキャン。これらが常に親指圏にあること

## 技術スタック

- Tailwind CSS v4 + shadcn/ui（`src/components/ui/`）。共通 atoms は `src/components/atoms/`
- 破壊的操作の確認は既存の `ConfirmDialog`（molecules）を使う
- a11y 自動チェック: Storybook の `@storybook/addon-a11y`

## プロジェクト固有の観点

- **オフライン方針**: 参照は可、編集はトーストで抑止（`docs/specs/features/pwa.md`）。
  この方針から外れた UI（オフラインで編集できそうに見える等）は指摘対象
- **i18n**: ja / en の 2 ロケール。英語で文字列が 1.5〜2 倍に伸びる前提でレイアウトを見る
- **期限バッジ**: 色 + テキストで意味を伝える（`ExpiryBadge`）。色のみの状態表現は指摘対象
- 数量入力は `inputMode="numeric"`、日付は date picker

## 修正まで行う場合

`react-component` / `ts-quality` スキルの PROJECT.md の規約に従って実装し、

```bash
npx oxfmt . && bun run check
```

を通すこと。
