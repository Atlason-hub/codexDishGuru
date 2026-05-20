-- Run this in the new Frankfurt Supabase project's SQL editor.
-- It recreates the storage policies DishGuru needs for user-owned uploads.

-- Avatars
drop policy if exists "Users can upload their own avatars" on storage.objects;
create policy "Users can upload their own avatars"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own avatars" on storage.objects;
create policy "Users can update their own avatars"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own avatars" on storage.objects;
create policy "Users can delete their own avatars"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Dish images
drop policy if exists "Users can upload their own dish images" on storage.objects;
create policy "Users can upload their own dish images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dish-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own dish images" on storage.objects;
create policy "Users can update their own dish images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dish-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'dish-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own dish images" on storage.objects;
create policy "Users can delete their own dish images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dish-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
