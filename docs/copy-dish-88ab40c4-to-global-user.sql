-- Copies the dish association `88ab40c4-189a-4aa1-bd70-9888dc62e56f`
-- so it also exists under the current global user.
--
-- Safe to run in the Supabase SQL editor.
-- If the same copy already exists for the resolved global user, it will not insert a duplicate.

do $$
declare
  source_row public.dish_associations%rowtype;
  resolved_global_user_id uuid;
begin
  select *
  into source_row
  from public.dish_associations
  where id = '88ab40c4-189a-4aa1-bd70-9888dc62e56f';

  if not found then
    raise exception 'Source dish_associations row not found: %', '88ab40c4-189a-4aa1-bd70-9888dc62e56f';
  end if;

  select da.user_id
  into resolved_global_user_id
  from public.dish_associations da
  where da.visibility_scope = 'global'
    and da.user_id is not null
  order by da.created_at desc nulls last
  limit 1;

  if resolved_global_user_id is null then
    raise exception 'Could not resolve a global user from dish_associations.visibility_scope = global';
  end if;

  if source_row.user_id = resolved_global_user_id and source_row.visibility_scope = 'global' then
    raise notice 'Dish association % is already owned by the resolved global user % and marked global.',
      source_row.id,
      resolved_global_user_id;
    return;
  end if;

  insert into public.dish_associations (
    user_id,
    restaurant_id,
    restaurant_name,
    cuisine,
    dish_id,
    dish_name,
    review_text,
    tasty_score,
    filling_score,
    image_url,
    image_path,
    created_at,
    visibility_scope
  )
  select
    resolved_global_user_id,
    source_row.restaurant_id,
    source_row.restaurant_name,
    source_row.cuisine,
    source_row.dish_id,
    source_row.dish_name,
    source_row.review_text,
    source_row.tasty_score,
    source_row.filling_score,
    source_row.image_url,
    source_row.image_path,
    source_row.created_at,
    'global'
  where not exists (
    select 1
    from public.dish_associations existing
    where existing.user_id = resolved_global_user_id
      and coalesce(existing.dish_id, -1) = coalesce(source_row.dish_id, -1)
      and coalesce(existing.restaurant_id, -1) = coalesce(source_row.restaurant_id, -1)
      and coalesce(existing.image_path, '') = coalesce(source_row.image_path, '')
      and coalesce(existing.review_text, '') = coalesce(source_row.review_text, '')
      and coalesce(existing.created_at, timestamptz 'epoch') = coalesce(source_row.created_at, timestamptz 'epoch')
  );

  raise notice 'Finished copying dish association % to global user %.',
    source_row.id,
    resolved_global_user_id;
end
$$;
