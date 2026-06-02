-- Quiet Focus AI Supabase schema

create table if not exists public.focus_sessions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.focus_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists task text not null default 'Focus session',
  add column if not exists focus_minutes integer not null default 0,
  add column if not exists distractions integer not null default 0,
  add column if not exists breaks integer not null default 0,
  add column if not exists refocuses integer not null default 0,
  add column if not exists score integer not null default 0,
  add column if not exists completed_naturally boolean not null default false,
  add column if not exists events jsonb not null default '[]'::jsonb,
  add column if not exists date date not null default current_date;

alter table public.focus_sessions enable row level security;

drop policy if exists "Authenticated insert focus_sessions" on public.focus_sessions;
drop policy if exists "Authenticated read focus_sessions" on public.focus_sessions;
drop policy if exists "Users insert own sessions" on public.focus_sessions;
drop policy if exists "Users read own sessions" on public.focus_sessions;
drop policy if exists "Users insert own focus_sessions" on public.focus_sessions;
drop policy if exists "Users read own focus_sessions" on public.focus_sessions;

create policy "Users insert own focus_sessions"
  on public.focus_sessions
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users read own focus_sessions"
  on public.focus_sessions
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select, insert on public.focus_sessions to authenticated;


create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "Public insert waitlist" on public.waitlist;

create policy "Public insert waitlist"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

grant insert on public.waitlist to anon, authenticated;
