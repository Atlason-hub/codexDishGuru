-- Pilot security hardening: make browser/mobile access least-privileged while
-- preserving service-role administration and membership RPC behavior.

create or replace function public.is_active_admin(p_require_admin boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.id = auth.uid()
      and au.status = 'active'
      and au.role in ('admin', case when p_require_admin then 'admin' else 'viewer' end)
  );
$$;

revoke all on function public.is_active_admin(boolean) from public, anon;
grant execute on function public.is_active_admin(boolean) to authenticated;

do $$
declare
  target_table text;
  policy_row record;
begin
  foreach target_table in array array['admin_users', 'companies', 'AppUsers', 'dish_associations', 'dish_reports']
  loop
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, target_table);
    end loop;
  end loop;
end;
$$;

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon;
grant select, insert, update, delete on public.admin_users to authenticated;
drop policy if exists "admin_users_read_admin" on public.admin_users;
create policy "admin_users_read_admin" on public.admin_users
  for select to authenticated using (public.is_active_admin(true));
drop policy if exists "admin_users_write_admin" on public.admin_users;
create policy "admin_users_write_admin" on public.admin_users
  for all to authenticated
  using (public.is_active_admin(true))
  with check (public.is_active_admin(true));

alter table public.companies enable row level security;
revoke all on public.companies from anon, authenticated;
grant select (id, company_key, name, domain, order_vendor, street_id, street, number, city_id, city_name, logo_url, created_at, group_type)
  on public.companies to anon, authenticated;
drop policy if exists "companies_public_domain_read" on public.companies;
create policy "companies_public_domain_read" on public.companies
  for select to anon using (group_type = 'domain');
drop policy if exists "companies_authenticated_read" on public.companies;
create policy "companies_authenticated_read" on public.companies
  for select to authenticated using (true);

alter table public."AppUsers" enable row level security;
revoke all on public."AppUsers" from anon;
grant select, insert, update on public."AppUsers" to authenticated;
drop policy if exists "app_users_read_own" on public."AppUsers";
create policy "app_users_read_own" on public."AppUsers"
  for select to authenticated
  using (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "app_users_insert_own" on public."AppUsers";
create policy "app_users_insert_own" on public."AppUsers"
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "app_users_update_own" on public."AppUsers";
create policy "app_users_update_own" on public."AppUsers"
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.dish_associations enable row level security;
grant select on public.dish_associations to anon;
grant select, insert, update, delete on public.dish_associations to authenticated;
drop policy if exists "dish_associations_insert_own" on public.dish_associations;
create policy "dish_associations_insert_own" on public.dish_associations
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "dish_associations_select_own" on public.dish_associations;
create policy "dish_associations_select_own" on public.dish_associations
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "dish_associations_update_own" on public.dish_associations;
create policy "dish_associations_update_own" on public.dish_associations
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "dish_associations_delete_own" on public.dish_associations;
create policy "dish_associations_delete_own" on public.dish_associations
  for delete to authenticated using (user_id = auth.uid());
drop policy if exists "dish_associations_global_read" on public.dish_associations;
create policy "dish_associations_global_read" on public.dish_associations
  for select to anon using (visibility_scope = 'global');

alter table public.dish_reports enable row level security;
revoke all on public.dish_reports from anon;
grant select, insert on public.dish_reports to authenticated;
drop policy if exists "dish_reports_insert_own" on public.dish_reports;
create policy "dish_reports_insert_own" on public.dish_reports
  for insert to authenticated with check (reported_by_user_id = auth.uid());
drop policy if exists "dish_reports_read_own" on public.dish_reports;
create policy "dish_reports_read_own" on public.dish_reports
  for select to authenticated using (reported_by_user_id = auth.uid());

drop function if exists public.resolve_group_code(text);

create table if not exists public.group_code_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now()
);
alter table public.group_code_attempts enable row level security;
revoke all on public.group_code_attempts from public, anon, authenticated;

create or replace function public.assign_my_group_code(p_code text)
returns table (id uuid, name text, logo_url text, order_vendor text)
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
  v_attempts integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if length(trim(coalesce(p_code, ''))) not between 3 and 64 then return; end if;

  insert into public.group_code_attempts (user_id, attempts, window_started_at)
  values (v_user_id, 1, now())
  on conflict (user_id) do update
  set attempts = case
        when group_code_attempts.window_started_at < now() - interval '15 minutes' then 1
        else group_code_attempts.attempts + 1
      end,
      window_started_at = case
        when group_code_attempts.window_started_at < now() - interval '15 minutes' then now()
        else group_code_attempts.window_started_at
      end
  returning attempts into v_attempts;

  if v_attempts > 10 then raise exception 'too many group code attempts'; end if;

  select c.* into v_group
  from public.companies c
  where c.group_type = 'code'
    and c.join_code is not null
    and upper(c.join_code) = upper(trim(p_code))
  limit 1;
  if v_group.id is null then return; end if;

  delete from public.group_code_attempts where user_id = v_user_id;
  update public."AppUsers"
  set group_id = v_group.id,
      user_id = v_user_id,
      email = case when v_email <> '' then v_email else email end,
      updated_at = now()
  where user_id = v_user_id or (v_email <> '' and lower(email) = v_email);
  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    v_domain := nullif(split_part(v_email, '@', 2), '');
    if v_domain is not null then
      select c.id into v_company_id
      from public.companies c
      where c.group_type = 'domain' and lower(c.domain) = lower(v_domain)
      limit 1;
    end if;
    insert into public."AppUsers" (user_id, email, company_id, group_id)
    values (v_user_id, v_email, coalesce(v_company_id, v_group.id), v_group.id);
  end if;

  return query select v_group.id, v_group.name, v_group.logo_url, v_group.order_vendor;
end;
$$;
revoke all on function public.assign_my_group_code(text) from public, anon;
grant execute on function public.assign_my_group_code(text) to authenticated;

create or replace function public.set_my_avatar_url(p_avatar_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_value text := nullif(trim(p_avatar_url), '');
  v_updated_count integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_value is not null and (length(v_value) > 2000 or v_value !~ '^https://') then
    raise exception 'invalid avatar url';
  end if;
  update public."AppUsers"
  set avatar_url = v_value, updated_at = now()
  where user_id = v_user_id
     or (v_email <> '' and lower(email) = v_email);
  get diagnostics v_updated_count = row_count;
  if v_updated_count = 0 then raise exception 'profile not found'; end if;
  return v_value;
end;
$$;
revoke all on function public.set_my_avatar_url(text) from public, anon;
grant execute on function public.set_my_avatar_url(text) to authenticated;

alter table public.dish_associations
  drop constraint if exists dish_associations_text_lengths;
alter table public.dish_associations
  add constraint dish_associations_text_lengths check (
    length(coalesce(dish_name, '')) <= 200 and
    length(coalesce(restaurant_name, '')) <= 200 and
    length(coalesce(review_text, '')) <= 5000 and
    length(coalesce(image_url, '')) <= 2000 and
    length(coalesce(image_path, '')) <= 500
  ) not valid;

alter table public.dish_association_drafts
  drop constraint if exists dish_association_drafts_text_lengths;
alter table public.dish_association_drafts
  add constraint dish_association_drafts_text_lengths check (
    length(coalesce(dish_name, '')) <= 200 and
    length(coalesce(restaurant_name, '')) <= 200 and
    length(coalesce(review_text, '')) <= 5000 and
    length(coalesce(image_url, '')) <= 2000 and
    length(coalesce(image_path, '')) <= 500
  ) not valid;

alter table public.dish_reports
  drop constraint if exists dish_reports_details_length;
alter table public.dish_reports
  add constraint dish_reports_details_length check (length(coalesce(details, '')) <= 2000) not valid;

alter table public.companies
  drop constraint if exists companies_text_lengths;
alter table public.companies
  add constraint companies_text_lengths check (
    length(coalesce(name, '')) <= 200 and
    length(coalesce(domain, '')) <= 255 and
    length(coalesce(join_code, '')) <= 64 and
    length(coalesce(logo_url, '')) <= 2000
  ) not valid;

grant select, insert, update, delete on public.dish_association_drafts to authenticated;
revoke all on public.dish_association_drafts from anon;

-- Storage writes must stay inside the authenticated user's first-level folder.
drop policy if exists "Users can upload their own avatars" on storage.objects;
drop policy if exists "Users can update their own avatars" on storage.objects;
drop policy if exists "Users can delete their own avatars" on storage.objects;
drop policy if exists "Users can upload their own dish images" on storage.objects;
drop policy if exists "Users can update their own dish images" on storage.objects;
drop policy if exists "Users can delete their own dish images" on storage.objects;

create policy "Users can upload their own avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update their own avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete their own avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload their own dish images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dish-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update their own dish images" on storage.objects
  for update to authenticated
  using (bucket_id = 'dish-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'dish-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete their own dish images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dish-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Optional legacy admin tables are protected when present.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['content_items', 'reports']
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on public.%I from anon', table_name);
      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_admin_read', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_admin_write', table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_active_admin(false))',
        table_name || '_admin_read', table_name
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_active_admin(true)) with check (public.is_active_admin(true))',
        table_name || '_admin_write', table_name
      );
    end if;
  end loop;
end;
$$;
