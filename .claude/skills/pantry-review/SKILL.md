---
name: pantry-review
description: >-
  Use when the user wants a household inventory health check — 「在庫レビューして」「週次レビュー」
  「食品ロスの状況見て」「無駄になってるものない？」「買い物リスト提案して」「在庫の棚卸し」など。
  期限・デッドストック・欠品を分析してレポートと買い物提案を出す生活系スキル。DB への書き込みはしない。
---

# Skill: pantry-review

在庫の健康診断レポートを作る。週次で回すことを想定した生活系スキル。
**読み取り専用**（SELECT のみ）。書き込みは SQL 提示 + ユーザー承認を経た場合に限る。

## Step 1. データ取得（Supabase MCP / SELECT のみ）

MCP が使えなければ、ユーザーに在庫と最近の消費状況を貼ってもらうフォールバックで進める。

```sql
-- 1. 在庫全体（期限順）
select i.name, i.units, i.content_amount, i.content_unit, i.opened_remaining,
       i.expiry_date, i.purchase_date, c.name as category, s.name as location
from items i
left join categories c on c.id = i.category_id
left join storage_locations s on s.id = i.storage_location_id
where i.deleted_at is null
order by i.expiry_date asc nulls last;

-- 2. 直近30日の消費ログ（動きの有無）
select item_id, sum(delta) as consumed, max(occurred_at) as last_used
from consumption_logs
where occurred_at > now() - interval '30 days'
group by item_id;

-- 3. 買い物リストの積み残し
select name, status, created_at
from shopping_list_items
where status = 'planned'
order by created_at asc;
```

（shopping_list_items は v1.1 以降。テーブルがなければスキップする）

## Step 2. 分析

### A. 期限アラート

- 期限切れ / 3日以内 / 7日以内 に分けて列挙
- 期限切れは「廃棄判断を」ではなく、まず **救済策**（加熱調理・冷凍・賞味期限なら状態確認）を添える
- 3〜7日のものは `recipe-from-stock` スキルでの献立化を提案する

### B. デッドストック

- `units > 0` かつ直近 30 日の消費ログなし、かつ purchase_date が 30 日以上前
- 「使い切りアイデア」or「次回から買わない候補」として提示

### C. 欠品・補充候補

- `units = 0`（使い切り状態）のうち、過去に消費実績が多いもの → 定番品の切らし
- 買い物リストに長期間 `planned` のまま残っているもの → 買い忘れ

### D. 記録衛生（データそのものの健康度）

- 期限 `null` の食品（登録時の入力漏れの可能性）
- カテゴリ / 保管場所が未設定のアイテム
- `opened_remaining = 0` のまま放置されているもの（実態は空のはず）

## Step 3. レポート出力

```markdown
# 🏠 在庫レビュー（YYYY-MM-DD）

## サマリ

在庫 N 品 / 🔴 期限切れ n / 🟠 3日以内 n / 💤 デッドストック n / 🛒 補充候補 n

## 🔴 今すぐ対応

（期限切れ・至急消費。1 行 1 アイテム + 救済策）

## 🟠 今週中に消費

（→ 献立化するなら recipe-from-stock を案内）

## 💤 眠っている在庫

（最終消費日 + 使い切りアイデア or 買わない提案）

## 🛒 買い物提案

（欠品定番品 + リスト積み残し。まとめて 1 回の買い物で済む形に）

## 🧹 記録のメンテ

（期限未入力・未分類など、アプリ上で直すと精度が上がるもの）

## 先週からの変化

（前回レビューが会話履歴にあれば差分を 2〜3 行。なければ省略）
```

- 各セクション 0 件なら「なし ✅」と明記（空セクションを黙って消さない）
- 全体で問題ゼロなら褒めて短く終える。無理に指摘を作らない

## Step 4. フォローアップ提案

- 買い物提案を `shopping_list_items` に登録したいと言われたら、INSERT 文を提示して
  承認後に実行する（`user_id` は既存行から取得、`status = 'planned'`）
- 「毎週やって」と言われたら、Claude Code の定期実行（Routine / スケジュール機能）で
  週 1 回このスキルを起動する設定を提案する

## やってはいけないこと

- 承認なしの書き込み
- 「捨てましょう」の断定（廃棄判断はユーザーの領分。救済策を先に出す）
- 件数の多い在庫の全行列挙（30 品を超えたらカテゴリ集計 + 問題のあるものだけ列挙）
