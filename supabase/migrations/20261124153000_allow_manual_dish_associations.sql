-- Manually entered restaurants and dishes have names but no external API ids.
alter table public.dish_associations
  alter column restaurant_id drop not null,
  alter column dish_id drop not null;
