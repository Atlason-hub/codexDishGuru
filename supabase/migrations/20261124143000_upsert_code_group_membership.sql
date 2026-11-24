-- Email-confirmed signups may reach their first login without an AppUsers row.
-- Assigning a valid code must create that profile, not only update existing rows.
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
  v_domain text;
  v_group public.companies%rowtype;
  v_company_id uuid;
  v_updated_count integer := 0;
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
      user_id = v_user_id,
      email = case when v_email <> '' then v_email else email end,
      updated_at = now()
  where user_id = v_user_id
     or (v_email <> '' and lower(email) = v_email);

  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    v_domain := nullif(split_part(v_email, '@', 2), '');

    if v_domain is not null then
      select c.id
        into v_company_id
      from public.companies c
      where c.group_type = 'domain'
        and lower(c.domain) = lower(v_domain)
      limit 1;
    end if;

    insert into public."AppUsers" (user_id, email, company_id, group_id)
    values (v_user_id, v_email, v_company_id, v_group.id);
  end if;

  return query
  select v_group.id, v_group.name, v_group.logo_url, v_group.order_vendor;
end;
$$;

revoke all on function public.assign_my_group_code(text) from public, anon;
grant execute on function public.assign_my_group_code(text) to authenticated;
