create table if not exists public.dish_reports (
  id uuid primary key default gen_random_uuid(),
  dish_association_id uuid not null references public.dish_associations(id) on delete cascade,
  reported_by_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (
    reason in (
      'wrong_photo',
      'wrong_name',
      'offensive',
      'spam_duplicate',
      'wrong_restaurant',
      'other'
    )
  ),
  details text,
  status text not null default 'open' check (
    status in ('open', 'reviewed', 'resolved', 'dismissed')
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists dish_reports_unique_reporter_per_dish
  on public.dish_reports (dish_association_id, reported_by_user_id);

alter table public.dish_reports enable row level security;

drop policy if exists "Users can insert their own dish reports" on public.dish_reports;
create policy "Users can insert their own dish reports"
on public.dish_reports
for insert
to authenticated
with check (auth.uid() = reported_by_user_id);

drop policy if exists "Users can view their own dish reports" on public.dish_reports;
create policy "Users can view their own dish reports"
on public.dish_reports
for select
to authenticated
using (auth.uid() = reported_by_user_id);
