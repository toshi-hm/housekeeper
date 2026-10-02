-- #1126: saveRecipe previously replaced a recipe's items via a plain
-- client-side "delete all -> insert all" sequence with no transaction. If the
-- insert failed after the delete succeeded (network drop, session expiry, a
-- concurrently-deleted referenced item causing an FK violation), the recipe
-- was left with zero items and no way to recover the loss.
--
-- Wrap the upsert + item replacement in a single function so it runs as one
-- atomic transaction: either the recipe and its new items are saved
-- together, or nothing changes. Mirrors save_shopping_list_template (#573).

create or replace function public.save_recipe(
  p_id uuid,
  p_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recipe_id uuid;
begin
  if p_id is null then
    insert into recipes (user_id, name)
    values (auth.uid(), p_name)
    returning id into v_recipe_id;
  else
    update recipes
    set name = p_name
    where id = p_id and user_id = auth.uid()
    returning id into v_recipe_id;

    if v_recipe_id is null then
      raise exception 'recipe not found' using errcode = 'HK003';
    end if;
  end if;

  delete from recipe_items where recipe_id = v_recipe_id;

  insert into recipe_items (recipe_id, item_id, amount)
  select v_recipe_id, (item ->> 'item_id')::uuid, (item ->> 'amount')::numeric
  from jsonb_array_elements(p_items) as item;

  return v_recipe_id;
end;
$$;

grant execute on function public.save_recipe(uuid, text, jsonb) to authenticated;
