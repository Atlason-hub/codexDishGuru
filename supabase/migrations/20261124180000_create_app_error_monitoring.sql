create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  error_message text not null,
  stack_trace text,
  screen text,
  action text,
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  group_id uuid references public.companies(id) on delete set null,
  client_install_id text,
  app_version text,
  build_version text,
  platform text,
  os_version text,
  expo_version text,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'investigating', 'resolved', 'ignored')),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists app_errors_status_last_seen_idx on public.app_errors(status, last_seen_at desc);
create index if not exists app_errors_user_idx on public.app_errors(user_id, last_seen_at desc);
alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

create policy "app_errors_admin_read" on public.app_errors
  for select to authenticated using (public.is_active_admin(false));
create policy "app_errors_admin_write" on public.app_errors
  for update to authenticated
  using (public.is_active_admin(true)) with check (public.is_active_admin(true));
create policy "app_errors_admin_delete" on public.app_errors
  for delete to authenticated using (public.is_active_admin(true));

create table if not exists public.app_error_rate_limits (
  client_key text primary key,
  window_started_at timestamptz not null default now(),
  event_count integer not null default 0
);
alter table public.app_error_rate_limits enable row level security;
revoke all on public.app_error_rate_limits from public, anon, authenticated;

create or replace function public.record_app_error(
  p_fingerprint text,
  p_error_message text,
  p_stack_trace text,
  p_screen text,
  p_action text,
  p_user_id uuid,
  p_company_id uuid,
  p_group_id uuid,
  p_client_install_id text,
  p_app_version text,
  p_build_version text,
  p_platform text,
  p_os_version text,
  p_expo_version text,
  p_context jsonb,
  p_client_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_id uuid;
begin
  if length(p_fingerprint) <> 64 or length(p_error_message) not between 1 and 2000 then
    raise exception 'invalid error payload';
  end if;

  insert into public.app_error_rate_limits(client_key, window_started_at, event_count)
  values (left(p_client_key, 200), now(), 1)
  on conflict (client_key) do update
  set event_count = case
        when app_error_rate_limits.window_started_at < now() - interval '1 hour' then 1
        else app_error_rate_limits.event_count + 1
      end,
      window_started_at = case
        when app_error_rate_limits.window_started_at < now() - interval '1 hour' then now()
        else app_error_rate_limits.window_started_at
      end
  returning event_count into v_count;

  if v_count > 30 then raise exception 'error submission rate exceeded'; end if;

  insert into public.app_errors(
    fingerprint, error_message, stack_trace, screen, action, user_id, company_id, group_id,
    client_install_id, app_version, build_version, platform, os_version, expo_version, context
  ) values (
    p_fingerprint, left(p_error_message, 2000), left(p_stack_trace, 8000), left(p_screen, 300),
    left(p_action, 200), p_user_id, p_company_id, p_group_id, left(p_client_install_id, 100),
    left(p_app_version, 40), left(p_build_version, 40), left(p_platform, 30),
    left(p_os_version, 80), left(p_expo_version, 40), coalesce(p_context, '{}'::jsonb)
  )
  on conflict (fingerprint) do update
  set occurrence_count = app_errors.occurrence_count + 1,
      last_seen_at = now(),
      user_id = coalesce(excluded.user_id, app_errors.user_id),
      company_id = coalesce(excluded.company_id, app_errors.company_id),
      group_id = coalesce(excluded.group_id, app_errors.group_id),
      context = excluded.context,
      stack_trace = coalesce(excluded.stack_trace, app_errors.stack_trace)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_app_error(text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.record_app_error(text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,text) to service_role;
