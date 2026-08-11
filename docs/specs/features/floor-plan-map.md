# Feature Spec: 間取りマップ

## 概要

保管場所写真に加えて、ユーザーがWeb上で2D間取りを作成し、在庫を間取り上で検索・配置できるようにする。
3Dは2Dの意味モデルから生成する参照表示とし、初期版では3D空間の直接編集・保存は行わない。

## スコープ判断

### v1で行うこと

- フッター左から3番目のマップタブと `/map` ルート。
- 保管場所横断の在庫検索。
- 保管場所ごとの写真 / 2D / 3D表示切替。
- 2Dのグリッド、線、矩形、ラベル、家具・収納の作成・移動・削除。
- グリッド吸着、キーボード操作、Undo/Redo、保存競合検出。
- 間取り上の在庫配置と配置済みアイテムの検索強調。
- 2Dからの3D参照表示、WebGLフォールバック。

### v1で行わないこと

- 3D空間での直接編集・保存。
- CAD級のドア・窓開口、寸法線、自由曲線、画像トレース。
- GLB/OBJインポート、家具アセットマーケット、共同編集。
- オフライン編集キュー。

## ユーザーストーリー

- ユーザーとして、フッターのマップから家の保管場所と在庫を検索したい。
- ユーザーとして、グリッド上に壁や収納を描いて家の2D間取りを保存したい。
- ユーザーとして、冷蔵庫や棚などの在庫を間取り上の位置に紐付けたい。
- ユーザーとして、2Dで作った間取りを3Dで見回したい。
- ユーザーとして、図面を操作できない場合でも一覧から対象在庫を開きたい。

## 実装方針

### 画面・ルート

```text
/_auth/map
/_auth/locations/$locationId
/_auth/locations/$locationId/edit
```

写真マップは既存ルートに残し、同ルートで view search param を使って表示モードを切り替える。
編集は別ルートに分け、誤操作で閲覧中の図面を変更しない。

### コンポーネント

- `src/components/atoms/FloorPlanShape.tsx`
- `src/components/atoms/FloorPlanItemMarker.tsx`
- `src/components/atoms/GridBackground.tsx`
- `src/components/molecules/FloorPlanToolbar.tsx`
- `src/components/molecules/MapViewToggle.tsx`
- `src/components/molecules/ItemPlacementRow.tsx`
- `src/components/organisms/FloorPlanEditor.tsx`
- `src/components/organisms/FloorPlanViewer.tsx`
- `src/components/organisms/ThreeDFloorPlanViewer.tsx`
- `src/components/organisms/MapSearchPanel.tsx`

Atomic Design上、図形はpropsのみのatom、操作バーはmolecule、データ取得・編集状態を持つ本体はorganismに置く。
atoms / molecules / organisms には対応する `.stories.tsx` とテストを作成する。

### 状態管理

- リモート状態: TanStack Query (`floor-plans`, `floor-plan-placements`, `items`)。
- 編集中状態: `useReducer`による純粋なdraft reducer。
- 履歴: reducerの過去状態と未来状態を保持するUndo/Redo。
- 保存: `requireOnline()`、Zod parse、revision条件付きmutation。
- 取得・保存データはSupabase生成型を基礎にし、JSONBはZodで境界検証する。

### 3D

`@react-three/fiber` と `three` を遅延ロードする。2Dの壁を薄い直方体、矩形を高さ付き直方体、円を円柱として描画する。
検索対象は3D Canvas上の色だけで示さず、DOMリストと選択ラベルを併設する。

## データ

詳細なSOTは `docs/specs/database.md` に定義する。

### floor_plans

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `storage_location_id uuid not null references storage_locations(id) on delete cascade`
- `name text not null`
- `schema_version integer not null default 1`
- `document jsonb not null`
- `revision integer not null default 1`
- `created_at`, `updated_at`

### floor_plan_item_placements

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `floor_plan_id uuid not null references floor_plans(id) on delete cascade`
- `item_id uuid not null references items(id) on delete cascade`
- `object_id text`
- `x`, `y`, `z numeric`
- `rotation numeric not null default 0`
- `created_at`, `updated_at`
- `unique(floor_plan_id, item_id)`

RLSは行の `user_id` だけでなく、参照先の `floor_plans` と `items` も呼び出しユーザー所有であることを検証する。

## エラー

- 未認証: 既存auth guardで `/login` へリダイレクト。
- オフライン保存: `OfflineError` を既存トーストで通知し、draftは画面に保持。
- JSON不正: 保存せず、再読み込みまたは初期化導線を表示する。
- revision競合: 保存せず、最新を再取得するか、ユーザーが破棄／再編集を選択する。
- WebGL初期化失敗: 2DビューとDOMリストへ切り替える。
- RLS拒否: 生のSupabaseエラーを表示せず、一般化した保存／取得エラーを表示する。

## v1.9 範囲

- 設計・migration・型・hook・2D編集・3D参照・検索・テストを完了する。
- 3Dは参照表示のみとする。

## Backlog

- 3Dでの直接編集・保存。
- ドア・窓・壁厚・寸法線。
- GLB/OBJインポートと家具ライブラリ。
- 間取りの複数revision履歴・差分表示。
- Household Sharing対応後の共同編集・権限。
