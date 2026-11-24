-- A signed-in user can belong to both an email-domain company and a code group.
-- Visibility is the union of both memberships, while branding remains group-first.
create or replace function public.get_my_membership_dishes()
returns setof public.dish_associations
language sql
stable
security definer
set search_path = public
as $$
  with my_memberships as (
    select distinct membership_id
    from public."AppUsers" viewer
    cross join lateral (
      values (viewer.company_id), (viewer.group_id)
    ) memberships(membership_id)
    where viewer.user_id = auth.uid()
      and membership_id is not null
  ),
  member_users as (
    select distinct member.user_id
    from public."AppUsers" member
    join my_memberships mine
      on member.company_id = mine.membership_id
      or member.group_id = mine.membership_id
    where member.user_id is not null
  )
  select association.*
  from public.dish_associations association
  where association.user_id in (select user_id from member_users)
  order by association.created_at desc;
$$;

create or replace function public.get_my_visible_dishes()
returns setof public.dish_associations
language sql
stable
security definer
set search_path = public
as $$
  with membership_dishes as (
    select * from public.get_my_membership_dishes()
  )
  select association.*
  from public.dish_associations association
  where association.visibility_scope = 'global'
     or association.id in (select id from membership_dishes)
  order by association.created_at desc;
$$;

create or replace function public.get_my_membership_user_ids()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with my_memberships as (
    select distinct membership_id
    from public."AppUsers" viewer
    cross join lateral (
      values (viewer.company_id), (viewer.group_id)
    ) memberships(membership_id)
    where viewer.user_id = auth.uid()
      and membership_id is not null
  )
  select distinct member.user_id
  from public."AppUsers" member
  join my_memberships mine
    on member.company_id = mine.membership_id
    or member.group_id = mine.membership_id
  where member.user_id is not null;
$$;

revoke all on function public.get_my_membership_dishes() from public, anon;
revoke all on function public.get_my_visible_dishes() from public, anon;
revoke all on function public.get_my_membership_user_ids() from public, anon;
grant execute on function public.get_my_membership_dishes() to authenticated;
grant execute on function public.get_my_visible_dishes() to authenticated;
grant execute on function public.get_my_membership_user_ids() to authenticated;
