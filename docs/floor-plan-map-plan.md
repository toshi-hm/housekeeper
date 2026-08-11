# 間取りマップ機能 実装計画

## 目的

フッターの左から3番目に「マップ」タブを追加し、保管場所・間取り・収納物をひとつの導線で検索できるようにする。
既存の保管場所写真マップは互換性を維持し、2D間取りと3D参照表示を追加する。

## 事実と推論

### 事実

- housekeeper は React 19、Vite、TanStack Router、TanStack Query、Supabase JS、Zod、Tailwind CSS を採用している。
- Supabase へのアクセスはクライアント直結で、RLS により `user_id` 単位で分離する。
- 既存の `storage_locations`、`items.storage_location_id`、`items.pin_x` / `items.pin_y`、写真用 Storage バケットが存在する。
- 既存の写真マップは `/_auth/locations/$locationId` に実装済みで、ピン未設定アイテムをリスト表示する。
- オフラインは参照のみで、編集・アップロード等の mutation は `requireOnline()` で抑止する。
- Atomic Design、Storybook、bun:test、Chromatic、Playwright、pgTAP の既存方針がある。

### 推論

- 2D間取りは壁・部屋・家具・在庫位置という意味を持つため、追加ライブラリなしの React + SVG が最初の実装に最も適する。
- 3Dは2Dの意味モデルからクライアント側で押し出す参照ビューに限定すると、保存形式と編集UIを二重化せずに済む。
- `pin_x` / `pin_y` は写真マップ専用として残し、間取りの在庫配置は別テーブルにする方が責務分離・検索・将来の複数マップ配置に強い。
- 3D編集、CAD級の開口部や自由曲線、外部3Dアセット取込は初期導入で実装すると保守・a11y・モバイル性能のリスクが高いため、次段階に分ける。

## 技術選定

### 2D

採用: **React + SVG + Pointer Events**

- `viewBox` でレスポンシブ表示できる。
- `<line>`、`<rect>`、`<polygon>`、`<text>`を意味単位で描画できる。
- Pointer Events でマウス・タッチ・ペンを統一できる。
- 図形一覧と検索結果を DOM のボタン／リンクとして提供し、SVGだけに依存しない a11y を実現できる。
- 追加依存がなく、2D表示の初期bundleを増やさない。

不採用:

- `react-konva` / Fabric.js: 高度なCanvas編集には有力だが、Canvasのa11y代替UIと命令型状態管理が必要になる。SVGの操作量が問題になった時に差し替える。
- React Flow: ノード／エッジ向けで、壁・部屋ポリゴンの意味モデルとは異なる。
- tldraw: 機能は豊富だが、現行の個人用・依存を抑える方針とProductionライセンス条件が合わない。

### 3D

採用: **three + @react-three/fiber**。OrbitControls等が必要な場合のみ **@react-three/drei** を追加する。

- 2Dの壁・矩形・家具を箱・平面・円柱へ変換する。
- ルートレベルで遅延ロードし、マップを選択するまで3D bundleを読み込まない。
- WebGL非対応・初期化失敗・低性能端末では2DとDOMリストへフォールバックする。
- 3D Canvasは補助的な視覚表示とし、検索・選択・詳細遷移はDOMリストからも可能にする。

不採用:

- Babylon.js: 高機能だが、今回のReact中心の参照表示にはbundle・学習コストが大きい。
- A-Frame: 3Dプロトタイプ向けで、React状態との同期や編集データ管理に不向き。
- 3Dシーン固有JSONを正本にする案: ライブラリ内部構造に依存し、将来のレンダラー交換が難しい。

## スコープ

### 実装する範囲

1. フッターの左から3番目に `/map` を追加する。
2. `/map` で保管場所を横断した在庫検索を行う。
3. 保管場所ごとに写真マップ、2D間取り、3D参照を切り替える。
4. 2Dでグリッド、線、矩形、部屋名、家具／収納オブジェクトを作成・移動・削除する。
5. グリッド吸着、選択、キーボード移動、Undo/Redo、保存前後のZod検証を提供する。
6. 既存在庫を検索し、間取り上のオブジェクトまたは位置へ配置する。
7. 3Dでは壁・床・矩形・円柱のプリミティブを参照表示する。
8. Loading / Empty / Error / Offline / WebGL fallback を実装する。
9. Storybook、axe、unit、route、E2E、DB/RLSテストを追加する。

### 実装しない範囲

- 3D空間での直接編集・保存。
- CAD級の壁厚自動計算、ドア／窓の開口、寸法線、BIM連携。
- 自由曲線、画像トレース、GLB/OBJインポート。
- 複数ユーザーによる同時編集、リアルタイム共同編集。
- オフラインでの編集キュー。

## データ設計

### 正本モデル

`floor_plans.document` にアプリ固有の意味モデルを保存する。ライブラリ固有JSONは保存しない。

```ts
interface FloorPlanDocument {
  schemaVersion: 1;
  units: "cm";
  width: number;
  height: number;
  gridSize: number;
  walls: Array<{
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
    thickness: number;
  }>;
  shapes: Array<{
    id: string;
    kind: "rectangle" | "circle" | "label";
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    label: string | null;
  }>;
}
```

在庫の紐付けは `floor_plan_item_placements` に分離する。`item_id`をJSONBに埋め込まない。

### Supabase migration順序

1. `floor_plans` テーブル、JSONBの基本制約、所有者RLS、検索用indexを追加する。
2. `floor_plan_item_placements` テーブル、`floor_plans` と `items` の所有権を検証するRLSを追加する。
3. `updated_at` トリガと revision 更新規則を追加する。
4. Supabase型を `bun run gen:types` で再生成する。
5. pgTAPで所有者分離、座標制約、参照先所有権、CASCADEを検証する。

### 競合とrevision

- `floor_plans.revision` を保存し、更新時にクライアントが読んだrevisionを条件にする。
- 条件に一致しない場合は `FloorPlanConflictError` として保存を拒否し、再読み込みを促す。
- 初期の単一ユーザー運用でも、複数タブ・複数端末の上書きを防ぐ。
- 履歴テーブルは初期スコープ外。必要になった場合は revision snapshot を別テーブルで追加する。

## UI / ルーティング

```text
/_auth/map                         # 全保管場所の在庫検索
/_auth/locations/$locationId       # 写真 / 2D / 3Dの表示
/_auth/locations/$locationId/edit  # 2D間取りの作成・編集
```

検索条件はURL search paramsに保持する。

```text
/map?q=冷蔵庫&locationId=...&view=2d&itemId=...
```

コンポーネント分類:

- atoms: `FloorPlanShape`, `FloorPlanHandle`, `FloorPlanItemMarker`, `GridBackground`
- molecules: `FloorPlanToolbar`, `ShapeInspector`, `ItemPlacementRow`, `MapViewToggle`
- organisms: `FloorPlanEditor`, `FloorPlanViewer`, `ThreeDFloorPlanViewer`, `MapSearchPanel`
- pages: `MapPage`, `LocationMapPage`, `FloorPlanEditorPage`

## 操作仕様

- グリッド既定値は10cm。保存単位はcm、描画上のviewBoxはcmをそのまま使う。
- 直線は始点・終点をPointer Eventsで指定し、Shift押下またはスナップで水平・垂直・45度に補正できる。
- 矩形は始点・終点から生成する。負の幅・高さは正規化する。
- すべての図形には一意のクライアントIDを付与する。
- `pointerdown` で選択、`pointermove` で移動、`pointerup` で履歴へ1操作として記録する。
- 44px相当のヒット領域を設ける。選択・移動・削除はキーボードからも可能にする。
- 保存中は保存ボタンを無効化し、失敗時はトーストと再試行導線を表示する。

## テスト・VRT・運用

### Unit / route

- Zod schema: 正常、空配列、境界座標、負値、未知kind、schemaVersion不一致。
- 編集 reducer: 追加・移動・削除・Undo/Redo・グリッド吸着・正規化。
- hooks: query、mutation、offline抑止、revision競合、所有者エラー。
- ルート: loading、empty、error、search param、アイテム詳細遷移、WebGL fallback。

### Storybook / axe / Chromatic

- Editor: Default、Empty、ManyShapes、Selected、Saving、Error、Mobile。
- Viewer: Default、NoPlan、NoItems、SearchHighlight、BoundaryCoordinates。
- 3D: WebGLAvailable、Fallback、ReducedMotion。
- 全新規StoryはDefaultを必須とし、a11y baselineに追加せずaxeを通過させる。

### E2E

- マップタブ追加とURL遷移。
- 検索 → 保管場所／アイテム詳細遷移。
- 2Dで線・矩形を作成して再読込後も表示。
- 在庫を検索して配置し、配置解除する。
- 写真マップ既存導線、写真なし、ピン未設定リスト。
- モバイルタッチ、キーボード、オフライン参照／編集抑止。

### 性能・監視

- 2Dは初期bundleを増やさない。3Dはroute-level lazy load。
- 500図形・500配置で操作可能性と描画時間を計測する。
- 写真領域とSVG領域に寸法を確保しCLSを抑える。
- Sentryには固定エラー分類のみ送り、在庫名・写真パス・JSONB全文は送らない。
- WebGL非対応時はエラー画面ではなく2Dとリストへフォールバックする。

## 実装PRの分割

1. 設計書・DB migration・型・Zodモデル。
2. 取得／保存hooksとモックデータ。
3. マップタブ・検索・2D閲覧。
4. 2D編集・配置・Undo/Redo。
5. 3D参照表示・遅延ロード・フォールバック。
6. Storybook / E2E / DBテスト・運用ドキュメント。

各PRは直列ブランチとし、各コミットは論理単位ごとに分割する。
