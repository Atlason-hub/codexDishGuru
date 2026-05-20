-- Run this in the new Frankfurt Supabase project's SQL editor.
-- It recreates the grants and row-level security policies needed
-- for DishGuru dish review inserts/updates/deletes by the owning user.

grant select, insert, update, delete on public.dish_associations to authenticated;
grant select on public.dish_associations to anon;
grant select, insert, update, delete on public.dish_associations to service_role;

alter table public.dish_associations enable row level security;

drop policy if exists "dish_associations_insert_own" on public.dish_associations;
create policy "dish_associations_insert_own"
on public.dish_associations
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "dish_associations_select_own" on public.dish_associations;
create policy "dish_associations_select_own"
on public.dish_associations
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "dish_associations_update_own" on public.dish_associations;
create policy "dish_associations_update_own"
on public.dish_associations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "dish_associations_delete_own" on public.dish_associations;
create policy "dish_associations_delete_own"
on public.dish_associations
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Anon can read global dishes" on public.dish_associations;
create policy "Anon can read global dishes"
on public.dish_associations
for select
to anon
using (visibility_scope = 'global');
