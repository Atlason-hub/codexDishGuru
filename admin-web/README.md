# Admin Web

## Supabase setup (free tier)

1) Create a Supabase project.
2) Run the SQL below to create tables + policies.
3) Create a Storage bucket named `company-logos` (public).
4) Copy your project URL and publishable (public) key into `.env`.
5) Add `SUPABASE_SERVICE_ROLE_KEY` in Vercel (server-side) for secure API access.

### .env (local dev)

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

### SQL schema

```sql
-- Admin profiles (role-based access)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer'
);

alter table public.profiles enable row level security;

create policy "Profiles read" on public.profiles
  for select using (true);

create policy "Profiles write" on public.profiles
  for insert with check (true);

create policy "Profiles update" on public.profiles
  for update using (true) with check (true);

-- Companies
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

create policy "Companies read" on public.companies
  for select using (true);

create policy "Companies write" on public.companies
  for insert with check (true);

create policy "Companies update" on public.companies
  for update using (true) with check (true);

create policy "Companies delete" on public.companies
  for delete using (true);

-- Admin users managed inside the admin console
create table if not exists public.admin_users (
  id uuid primary key,
  full_name text not null,
  email text not null,
  role text not null,
  status text not null,
  created_at timestamptz default now()
);

alter table public.admin_users enable row level security;

create policy "Admin users read" on public.admin_users
  for select using (true);

create policy "Admin users write" on public.admin_users
  for insert with check (true);

create policy "Admin users update" on public.admin_users
  for update using (true) with check (true);

create policy "Admin users delete" on public.admin_users
  for delete using (true);

-- Content
create table if not exists public.content_items (
  id uuid primary key,
  title text not null,
  type text not null,
  status text not null,
  author text not null,
  created_at timestamptz default now()
);

alter table public.content_items enable row level security;

create policy "Content read" on public.content_items
  for select using (true);

create policy "Content write" on public.content_items
  for insert with check (true);

create policy "Content update" on public.content_items
  for update using (true) with check (true);

create policy "Content delete" on public.content_items
  for delete using (true);

-- Reports
create table if not exists public.reports (
  id uuid primary key,
  title text not null,
  category text not null,
  status text not null,
  created_by text not null,
  created_at timestamptz default now()
);

alter table public.reports enable row level security;

create policy "Reports read" on public.reports
  for select using (true);

create policy "Reports write" on public.reports
  for insert with check (true);

create policy "Reports update" on public.reports
  for update using (true) with check (true);

create policy "Reports delete" on public.reports
  for delete using (true);
```

### Storage policy (company logos)

Create a **public** bucket named `company-logos` in Supabase Storage.

Optionally, add a policy to allow uploads:

```sql
create policy "Logos public" on storage.objects
  for all using (bucket_id = 'company-logos')
  with check (bucket_id = 'company-logos');
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
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
5) Deploy.

The `/api/cities`, `/api/companies`, and `/api/logo` serverless functions proxy 10bis and Supabase for production (including logo uploads).
