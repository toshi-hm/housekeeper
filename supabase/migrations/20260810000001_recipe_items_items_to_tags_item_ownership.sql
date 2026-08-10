-- recipe_items / items_to_tags: item_id 所有権チェックの追加 (#804)
--
-- 既存ポリシーは親レコード（recipes.user_id / items_to_tags.user_id）の
-- 所有権のみを検証しており、参照先の item_id が実際にそのユーザーの
-- items 行かどうかは検証していなかった。テーブルレベルのFK制約はRLSより
-- 高い権限で解決されるため、これだけでは他ユーザーの item_id を推測・
-- 参照した行の作成を防げない（item_lots で既に採用済みの
-- 「ownership via join」パターンに揃える）。

alter policy "recipe_items_owner_all"
  on public.recipe_items
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_items.recipe_id
        and r.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.items i
      where i.id = recipe_items.item_id
        and i.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_items.recipe_id
        and r.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.items i
      where i.id = recipe_items.item_id
        and i.user_id = auth.uid()
    )
  );

alter policy "items_to_tags_owner_all"
  on public.items_to_tags
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.items i
      where i.id = items_to_tags.item_id
        and i.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.items i
      where i.id = items_to_tags.item_id
        and i.user_id = auth.uid()
    )
  );
