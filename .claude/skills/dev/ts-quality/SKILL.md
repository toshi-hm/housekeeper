---
name: ts-quality
description: >-
  Use when writing or refactoring TypeScript — 「リファクタして」「型を直して」「any を消して」
  「TypeScript の書き方を揃えて」など。strict 前提の型品質原則（no any / unknown+バリデーション /
  網羅性チェック）とプロジェクト固有の記法規約を適用し、lint / typecheck を通すところまで行う。
---

# Skill: ts-quality

TypeScript の型品質を上げる。新規実装・リファクタリング両方で使う。

## Step 0. プロジェクト設定の解決

1. **同ディレクトリの `PROJECT.md` があれば読み、その記法規約を最優先する**
2. なければ以下から自動検出する:
   - `CLAUDE.md` — 記法ルールの明文化があるか
   - lint 設定（eslint / oxlint / biome 等）— 強制されているルール
   - `tsconfig.json` — strict 系フラグの状態
   - 既存コード 2〜3 ファイル — `function` vs arrow、`type` vs `interface` などの支配的スタイル
3. 明文規約がなければ **既存コードの支配的スタイルに合わせる**（勝手に好みを持ち込まない）

## 汎用原則（どのプロジェクトでも適用）

### 1. `any` を増やさない

型が不明な外部入力（API レスポンス、`JSON.parse`、Storage、postMessage）は
`unknown` で受けてスキーマバリデーション（Zod 等、プロジェクト採用のもの)でパースする。

```ts
// NG
const data = (await res.json()) as any;

// OK（Zod の例）
const raw: unknown = await res.json();
const data = resultSchema.parse(raw);
```

- バリデーションライブラリ未採用のプロジェクトでは型ガード関数で絞り込む
- 既存の `any` を見つけたら、依頼範囲内なら直し、範囲外なら報告に含める

### 2. `as` キャストを最小にする

`as` は「型システムより自分が正しい」という主張。使う場合は根拠が言えること。
`as unknown as T` の二段キャストは設計の悪臭 — 元の型付けを直せないか先に検討する。

### 3. ユニオンの網羅性チェック

分岐がユニオンの全ケースを扱うことをコンパイラに保証させる。

```ts
// switch なら default で never に落とす
default:
  return status satisfies never;

// マップで表現できるならこちらを優先（キー漏れがコンパイルエラーになる）
const label = {
  a: "...",
  b: "...",
} as const satisfies Record<MyUnion, string>;
```

### 4. 握りつぶさない

- `@ts-ignore` 禁止。やむを得ない場合のみ `@ts-expect-error` + 理由コメント
- 空 catch でエラーを消さない。プロジェクトのエラーハンドリング方針
  （throw して上位で処理 / Result 型 / トースト通知など）に合わせる

### 5. 生成物・自動整形に手を出さない

- コード生成された型定義ファイルは手編集せず、生成コマンドを使う
- import 順序などフォーマッタ/lint の autofix があるものは手で並べ替えない

## リファクタリング時の手順

1. 対象範囲の違反を洗い出す（`rg ": any|as any|@ts-ignore"` などで機械的に探す +
   PROJECT.md の規約項目を目視確認）
2. **挙動を変えない変更**（記法統一）と **挙動が変わりうる変更**（バリデーション導入等）を
   分けて報告する
3. 修正を適用する
4. プロジェクトの format / lint / typecheck / test をすべて通す

## やってはいけないこと

- 明文規約のないプロジェクトに自分の流儀を持ち込む（既存スタイルが正）
- `as any` / `@ts-ignore` での握りつぶし
- 依頼範囲を超えた大規模リネーム・構造変更（見つけた問題は報告に留める）
- lint が通っただけで完了扱いにする（網羅性・バリデーションの質は機械検出できない。目視確認する）

## Definition of Done

- [ ] 対象範囲に汎用原則 + プロジェクト規約への違反が残っていない
- [ ] format / lint / typecheck が通る
- [ ] 既存テストが通る
- [ ] 挙動が変わりうる変更をした場合、その旨と理由を報告した
