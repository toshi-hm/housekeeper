# Architecture Spec

## Component Design: Atomic Design

All components follow Atomic Design principles.

### Directory Structure

```
src/
  components/
    atoms/          # 最小単位。単体で意味を持つ
    molecules/      # atomsを組み合わせた小さなUI
    organisms/      # molecules/atomsで構成される独立したUIブロック
    templates/      # ページレイアウトの骨格（データを持たない）
    pages/          # templatesにデータを流し込む最上位コンポーネント
    ui/             # shadcn/ui 自動生成コンポーネント（Atomic分類しない）
```

### Classification Guide

| Layer | 例 |
|---|---|
| atoms | Button, Badge, Input, Label, ExpiryBadge, Spinner |
| molecules | FormField, ItemCard, SearchBar, BarcodeButton |
| organisms | ItemForm, ItemList, BarcodeScanner, Header, AuthForm |
| templates | DashboardTemplate, LoginTemplate |
| pages | DashboardPage, LoginPage（routesからimportされる） |

### Rules
- atomsはpropsのみで動作し、外部状態に依存しない
- molecules以上はatomsを使う（直接HTMLタグを多用しない）
- organisms以上でのみhooksやSupabase呼び出しを許可する
- templatesはchildren/slotでコンテンツを受け取るだけ（ロジックなし）
- shadcn/uiコンポーネントはsrc/components/ui/に置き、Atomic分類しない

## Routing (TanStack Router, file-based)

```
src/routes/
  __root.tsx
  login.tsx
  _auth.tsx
  _auth.index.tsx
  _auth.items.new.tsx
  _auth.items.$itemId.tsx
  _auth.items.$itemId.edit.tsx
```

- _auth.tsx: 未認証なら/loginへリダイレクト
- routesはpagesをimportするだけ。ロジックはpages以下に書く

