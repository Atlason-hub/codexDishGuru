-- Avatar changes belong to the authenticated user. Keep the client away from
-- broad AppUsers update policies and update every duplicate legacy profile.
create or replace function public.set_my_avatar_url(p_avatar_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_updated_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  update public."AppUsers"
  set avatar_url = nullif(trim(p_avatar_url), ''),
      updated_at = now()
  where user_id = v_user_id
     or (v_email <> '' and lower(email) = v_email);

  get diagnostics v_updated_count = row_count;
  if v_updated_count = 0 then
    raise exception 'profile not found';
  end if;

  return nullif(trim(p_avatar_url), '');
end;
$$;

revoke all on function public.set_my_avatar_url(text) from public, anon;
grant execute on function public.set_my_avatar_url(text) to authenticated;
