-- Code-based groups reuse the existing companies entity so all dish sharing,
-- address, vendor and logo behavior continues to work with a stable id.
alter table public.companies
  add column if not exists group_type text not null default 'domain',
  add column if not exists join_code text;

alter table public.companies
  drop constraint if exists companies_group_type_check;

alter table public.companies
  add constraint companies_group_type_check
  check (group_type in ('domain', 'code'));

create unique index if not exists companies_join_code_unique
  on public.companies (upper(join_code))
  where join_code is not null;

alter table public."AppUsers"
  add column if not exists group_id uuid references public.companies(id) on delete set null;

create index if not exists app_users_group_id_idx
  on public."AppUsers" (group_id);

-- The app can validate a code without exposing the complete list of codes.
create or replace function public.resolve_group_code(p_code text)
returns table (
  id uuid,
  name text,
  logo_url text,
  order_vendor text,
  city_id integer,
  city_name text,
  street_id integer,
  street text,
  number text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.logo_url,
    c.order_vendor,
    c.city_id,
    c.city_name,
    c.street_id,
    c.street,
    c.number
  from public.companies c
  where c.group_type = 'code'
    and c.join_code is not null
    and upper(c.join_code) = upper(trim(p_code))
  limit 1;
$$;

grant execute on function public.resolve_group_code(text) to anon, authenticated;

