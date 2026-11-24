-- Assign the signed-in user to a code group without exposing AppUsers updates
-- to anonymous clients or depending on broad table update policies.
create or replace function public.assign_my_group_code(p_code text)
returns table (
  id uuid,
  name text,
  logo_url text,
  order_vendor text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_group public.companies%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select c.*
    into v_group
  from public.companies c
  where c.group_type = 'code'
    and c.join_code is not null
    and upper(c.join_code) = upper(trim(p_code))
  limit 1;

  if v_group.id is null then
    return;
  end if;

  update public."AppUsers"
  set group_id = v_group.id,
      updated_at = now()
  where user_id = v_user_id
     or (v_email <> '' and lower(email) = v_email);

  return query
  select v_group.id, v_group.name, v_group.logo_url, v_group.order_vendor;
end;
$$;

revoke all on function public.assign_my_group_code(text) from public, anon;
grant execute on function public.assign_my_group_code(text) to authenticated;
