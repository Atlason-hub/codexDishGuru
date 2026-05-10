begin;

-- Normalize stored profile emails so duplicate checks are consistent.
update public."AppUsers"
set email = nullif(lower(btrim(email)), '')
where email is distinct from nullif(lower(btrim(email)), '');

-- Delete only "safe" duplicate profile rows:
-- keep rows that already own dishes, and only remove duplicate rows that own none.
with dish_counts as (
  select
    da.user_id,
    count(*)::int as dish_count
  from public.dish_associations da
  where da.user_id is not null
  group by da.user_id
),
ranked_profiles as (
  select
    au.user_id,
    lower(btrim(au.email)) as normalized_email,
    coalesce(dc.dish_count, 0) as dish_count,
    row_number() over (
      partition by lower(btrim(au.email))
      order by
        case when coalesce(dc.dish_count, 0) > 0 then 0 else 1 end,
        case when au.company_id is not null then 0 else 1 end,
        case when au.avatar_url is not null then 0 else 1 end,
        au.user_id
    ) as keep_rank
  from public."AppUsers" au
  left join dish_counts dc on dc.user_id = au.user_id
  where au.email is not null
    and btrim(au.email) <> ''
),
safe_duplicate_rows as (
  select rp.user_id
  from ranked_profiles rp
  where rp.keep_rank > 1
    and rp.dish_count = 0
)
delete from public."AppUsers" au
using safe_duplicate_rows doomed
where au.user_id = doomed.user_id;

-- Prevent new duplicate emails at the profile-table level.
create or replace function public.normalize_and_guard_appusers_email()
returns trigger
language plpgsql
as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');

  if new.email is not null and exists (
    select 1
    from public."AppUsers" existing
    where lower(btrim(existing.email)) = new.email
      and existing.user_id <> new.user_id
  ) then
    raise exception 'An AppUsers row already exists for email %', new.email
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_and_guard_appusers_email on public."AppUsers";

create trigger trg_normalize_and_guard_appusers_email
before insert or update of email on public."AppUsers"
for each row
execute function public.normalize_and_guard_appusers_email();

-- When an auth user is deleted, also remove any lingering profile-table row.
create or replace function public.delete_appusers_profile_for_deleted_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from public."AppUsers"
  where user_id = old.id;

  return old;
end;
$$;

drop trigger if exists trg_delete_appusers_profile_for_deleted_auth_user on auth.users;

create trigger trg_delete_appusers_profile_for_deleted_auth_user
after delete on auth.users
for each row
execute function public.delete_appusers_profile_for_deleted_auth_user();

commit;

-- Review anything still duplicated after the safe cleanup.
-- These rows were intentionally left alone because more than one user_id
-- under the same email still owns dishes, so automatic deletion would risk data loss.
with dish_counts as (
  select
    da.user_id,
    count(*)::int as dish_count
  from public.dish_associations da
  where da.user_id is not null
  group by da.user_id
)
select
  lower(btrim(au.email)) as normalized_email,
  count(*) as remaining_rows,
  sum(case when coalesce(dc.dish_count, 0) > 0 then 1 else 0 end) as rows_with_dishes,
  array_agg(
    json_build_object(
      'user_id', au.user_id,
      'dish_count', coalesce(dc.dish_count, 0),
      'company_id', au.company_id
    )
    order by coalesce(dc.dish_count, 0) desc, au.user_id
  ) as rows
from public."AppUsers" au
left join dish_counts dc on dc.user_id = au.user_id
where au.email is not null
  and btrim(au.email) <> ''
group by lower(btrim(au.email))
having count(*) > 1
order by remaining_rows desc, normalized_email asc;
