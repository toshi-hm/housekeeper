---
name: recipe-from-stock
description: >-
  Use when the user wants meal ideas from current inventory — 「今ある材料で何作れる？」「献立考えて」
  「レシピ提案して」「期限が近いもので一品」「今晩なに作ろう」など。housekeeper の在庫データ（Supabase）から
  期限接近アイテム優先の献立・レシピを提案する生活系スキル。DB への書き込みはしない。
---

# Skill: recipe-from-stock

housekeeper の在庫データから、**期限が近い食材を優先的に消費する**献立・レシピを提案する。

## 原則

- **読み取り専用**。DB への書き込み（買い物リスト追加等）は行わない。
  書き込みが有用な場面では SQL を提示してユーザーの明示的な確認を得てから、
  かつ Supabase MCP が使える場合のみ実行する
- 提案の最優先基準は「期限接近アイテムの消費」＝食品ロス削減

## Step 1. 在庫を取得する

### 手段 A: Supabase MCP（第一候補）

`mcp__Supabase__execute_sql` で SELECT のみ実行する。プロジェクトは list_projects で特定。

```sql
select
  i.name,
  i.units,
  i.content_amount,
  i.content_unit,
  i.opened_remaining,
  i.expiry_date,
  c.name as category,
  s.name as location
from items i
left join categories c on c.id = i.category_id
left join storage_locations s on s.id = i.storage_location_id
where i.deleted_at is null
  and i.units > 0
order by i.expiry_date asc nulls last;
```

### 手段 B: フォールバック

MCP が使えない場合は、ユーザーに在庫リスト（アプリの一覧のコピペで可）を
貼ってもらう。調味料など「アプリ未登録の定番在庫」の有無も一言確認する。

## Step 2. 在庫を分類する

| 区分    | 条件                                 | 扱い                           |
| ------- | ------------------------------------ | ------------------------------ |
| 🔴 至急 | 期限切れ〜3日以内 / 開封済み残量あり | 今日〜明日の献立に必ず組み込む |
| 🟡 近い | 期限 4〜7日                          | 数日内の献立に組み込む         |
| 🟢 余裕 | それ以降 / 期限なし                  | 組み合わせ要員                 |

- 期限切れのものは安全性を機械判断しない。「消費期限か賞味期限か・状態を見て判断を」と添え、
  明らかに危険なもの（期限切れの生鮮・開封後長期）は献立に入れない
- 食材でないもの（洗剤等、カテゴリで判別）は除外する

## Step 3. 献立を提案する

依頼に応じて 1食 or 数日分。デフォルトは **今日の夕食 2〜3 案**。

各案のフォーマット:

```markdown
### 案1: <料理名>（和/洋/中、調理時間目安）

- **消費できる在庫**: 🔴鶏もも肉(期限明日) / 🟡キャベツ半玉 / 🟢卵
- **買い足し**: なし（or 最小限のリスト）
- **作り方の要点**: 3〜5 行

> 期限効果: 🔴 1 品・🟡 1 品を消費
```

### 提案の質の基準

- 買い足しゼロ or 最小の案を必ず 1 つ含める
- 現実的な家庭料理にする（特殊器具・入手困難食材を要求しない）
- 量の整合性を見る（`units × content_amount` と `opened_remaining` から
  「使い切れるか・半端が残るか」に言及。半端が残るなら翌日の使い道も添える）
- 数日分の依頼なら、🔴→🟡 の消費順で日割りし、同じ食材の連投を避ける

## Step 4. 締め

- 選ばれた献立の詳細レシピ（分量・手順）を求められたら展開する
- 買い足しが出た場合: 「買い物リストに追加する SQL を用意できます」と提案し、
  **承認された場合のみ** `shopping_list_items` への INSERT を提示・実行する
  （`user_id` は既存行から取得。status は `planned`）
- 使った食材の消費記録はアプリ側の操作に委ねる（このスキルからは書き込まない）

## やってはいけないこと

- 確認なしの INSERT / UPDATE / DELETE（SELECT 以外を勝手に実行しない）
- 期限切れ食品を無条件で「食べられる」と断定する
- 在庫にない食材前提のレシピを「在庫から作れる」と提示する
