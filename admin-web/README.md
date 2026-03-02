# Admin Web

## Supabase setup (free tier)

1) Create a Supabase project.
2) Create the `companies` table using the SQL below.
3) Copy your project URL and publishable (public) key into `.env`.

### .env

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

### SQL schema

```sql
create table if not exists public.companies (
  id uuid primary key,
  name text not null,
  domain text not null,
  street text not null,
  number text not null,
  city_id integer not null,
  city_name text not null,
  logo_url text,
  created_at timestamptz default now()
);

alter table public.companies enable row level security;

create policy "Public read" on public.companies
  for select using (true);

create policy "Public write" on public.companies
  for insert with check (true);

create policy "Public update" on public.companies
  for update using (true) with check (true);

create policy "Public delete" on public.companies
  for delete using (true);
```

## Run locally

```bash
cd /Users/adiatlas/Documents/CodexDishGuru/admin-web
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5174`).

## City autocomplete

City search is proxied through Vite at `/api/cities` to avoid CORS during local dev.

## Deploy to Vercel (free)

1) Push this repo to GitHub.
2) Create a new Vercel project and import the repo.
3) Set **Root Directory** to `admin-web`.
4) Add environment variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5) Deploy.

The `/api/cities` serverless function will proxy 10bis for production.
