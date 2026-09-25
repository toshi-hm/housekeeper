-- カテゴリの表示順（お店の売り場順）を保持する列を追加する（#1008）。
--
-- not null default 0 のため、既存カテゴリは全て同じ値になり、これまでの
-- 表示順（name 昇順、アプリ側のフォールバックソート）がそのまま保たれる。
-- ユーザーが並べ替え操作を行って初めて意味のある値が入る。
alter table public.categories
  add column if not exists sort_order integer not null default 0;

create index if not exists categories_sort_order_idx on public.categories(user_id, sort_order);
