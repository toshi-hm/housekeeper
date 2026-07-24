-- #573: saveTemplate previously replaced a template's items via a plain
-- client-side "delete all -> insert all" sequence with no transaction. If the
-- insert failed after the delete succeeded (network drop, session expiry),
-- the template was left with zero items and no way to recover the loss.
--
-- Wrap the upsert + item replacement in a single function so it runs as one
-- atomic transaction: either the template and its new items are saved
-- together, or nothing changes.

create or replace function public.save_shopping_list_template(
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
  v_template_id uuid;
begin
  if p_id is null then
    insert into shopping_list_templates (user_id, name)
    values (auth.uid(), p_name)
    returning id into v_template_id;
  else
    update shopping_list_templates
    set name = p_name
    where id = p_id and user_id = auth.uid()
    returning id into v_template_id;

    if v_template_id is null then
      raise exception 'template not found' using errcode = 'HK003';
    end if;
  end if;

  delete from shopping_list_template_items where template_id = v_template_id;

  insert into shopping_list_template_items (template_id, user_id, name, desired_units)
  select v_template_id, auth.uid(), item ->> 'name', (item ->> 'desired_units')::int
  from jsonb_array_elements(p_items) as item;

  return v_template_id;
end;
$$;

grant execute on function public.save_shopping_list_template(uuid, text, jsonb) to authenticated;
