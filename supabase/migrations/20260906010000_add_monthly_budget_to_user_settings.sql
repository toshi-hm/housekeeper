-- 月次予算超過アラート (#991)
--
-- 世帯全体（単一）の月次支出上限を保持する。NULL（デフォルト）= 未設定で、
-- `BudgetBanner` はこの値が NULL の間は何も表示しない（予算機能を使わない
-- ユーザーへの影響ゼロ、`docs/specs/features/budget-alert.md` 参照）。
-- カテゴリ別の予算内訳は v1 では扱わない。
--
-- `user_settings` は既に所有者スコープの RLS ポリシー
-- (`user_settings_owner_all`, 20260430000005) が全カラムを対象にしているため、
-- 追加のポリシー変更は不要。
alter table public.user_settings
  add column if not exists monthly_budget numeric
    check (monthly_budget is null or monthly_budget >= 0);
