create table if not exists public.dish_association_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text,
  image_path text,
  restaurant_id bigint,
  restaurant_name text,
  dish_id bigint,
  dish_name text,
  review_text text,
  tasty_score integer,
  filling_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dish_association_drafts_user_updated_idx
  on public.dish_association_drafts (user_id, updated_at desc);

alter table public.dish_association_drafts enable row level security;

drop policy if exists "Users can view their own dish drafts" on public.dish_association_drafts;
create policy "Users can view their own dish drafts"
  on public.dish_association_drafts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own dish drafts" on public.dish_association_drafts;
create policy "Users can insert their own dish drafts"
  on public.dish_association_drafts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own dish drafts" on public.dish_association_drafts;
create policy "Users can update their own dish drafts"
  on public.dish_association_drafts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own dish drafts" on public.dish_association_drafts;
create policy "Users can delete their own dish drafts"
  on public.dish_association_drafts
  for delete
  using (auth.uid() = user_id);
