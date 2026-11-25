-- Code-group members may override the group's ordering vendor for themselves.
-- A null override keeps the administrator-configured group default.

alter table public."AppUsers"
  add column if not exists order_vendor_override text;

alter table public."AppUsers"
  drop constraint if exists app_users_order_vendor_override_check;
alter table public."AppUsers"
  add constraint app_users_order_vendor_override_check
  check (order_vendor_override is null or order_vendor_override in ('10bis', 'Cibus', 'Wolt'));

create or replace function public.protect_app_user_group_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Group membership is assigned only through the validated group-code RPC or
  -- trusted administration. Authenticated clients cannot self-assign a group id.
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'INSERT' and new.group_id is not null then
      raise exception 'group membership must be assigned with a valid group code';
    end if;
    if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
      raise exception 'group membership cannot be changed directly';
    end if;
    if new.order_vendor_override is not null and coalesce(old.group_id, new.group_id) is null then
      raise exception 'order vendor preference is available only to code-group members';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_app_user_group_membership_trigger on public."AppUsers";
create trigger protect_app_user_group_membership_trigger
before insert or update on public."AppUsers"
for each row execute function public.protect_app_user_group_membership();

create or replace function public.get_my_order_vendor_settings()
returns table (
  eligible boolean,
  group_default text,
  user_override text,
  effective_vendor text
)
language sql
stable
security definer
set search_path = public
as $$
  with profile as (
    select au.group_id, au.order_vendor_override
    from public."AppUsers" au
    where au.user_id = auth.uid()
    order by au.updated_at desc
    limit 1
  )
  select
    profile.group_id is not null,
    company.order_vendor,
    profile.order_vendor_override,
    coalesce(profile.order_vendor_override, company.order_vendor)
  from profile
  left join public.companies company on company.id = profile.group_id;
$$;

revoke all on function public.get_my_order_vendor_settings() from public, anon;
grant execute on function public.get_my_order_vendor_settings() to authenticated;

create or replace function public.set_my_order_vendor_override(p_vendor text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_vendor text := nullif(trim(coalesce(p_vendor, '')), '');
  v_group_default text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if v_vendor is not null and v_vendor not in ('10bis', 'Cibus', 'Wolt') then
    raise exception 'invalid order vendor';
  end if;

  select company.order_vendor into v_group_default
  from public."AppUsers" au
  join public.companies company on company.id = au.group_id
  where au.user_id = v_user_id
  order by au.updated_at desc
  limit 1;

  if not found then
    raise exception 'order vendor preference is available only to code-group members';
  end if;

  update public."AppUsers"
  set order_vendor_override = v_vendor,
      updated_at = now()
  where user_id = v_user_id;

  return coalesce(v_vendor, v_group_default);
end;
$$;

revoke all on function public.set_my_order_vendor_override(text) from public, anon;
grant execute on function public.set_my_order_vendor_override(text) to authenticated;
