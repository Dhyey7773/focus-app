-- Quiet Focus — full focus_sessions schema + RLS
-- Run in Supabase → SQL Editor (safe to re-run)

create table if not exists public.focus_sessions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  task text default 'Focus session',
  focus_minutes integer default 0,
  distractions integer default 0,
  breaks integer default 0,
  refocuses integer default 0,
  score integer default 0,
  completed_naturally boolean default false,
  events jsonb default '[]'::jsonb,
  date date default (current_date),
  created_at timestamptz default now()
);

-- Upgrade old tables (duration / interruptions / completed)
alter table public.focus_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.focus_sessions add column if not exists task text default 'Focus session';
alter table public.focus_sessions add column if not exists focus_minutes integer default 0;
alter table public.focus_sessions add column if not exists distractions integer default 0;
alter table public.focus_sessions add column if not exists breaks integer default 0;
alter table public.focus_sessions add column if not exists refocuses integer default 0;
alter table public.focus_sessions add column if not exists score integer default 0;
alter table public.focus_sessions add column if not exists completed_naturally boolean default false;
alter table public.focus_sessions add column if not exists events jsonb default '[]'::jsonb;
alter table public.focus_sessions add column if not exists date date default (current_date);

-- Migrate legacy rows if present
update public.focus_sessions
set
  focus_minutes = coalesce(focus_minutes, duration, 0),
  distractions = coalesce(distractions, interruptions, 0),
  completed_naturally = coalesce(completed_naturally, completed, false)
where focus_minutes is null or distractions is null;

alter table public.focus_sessions enable row level security;

drop policy if exists "Authenticated insert focus_sessions" on public.focus_sessions;
drop policy if exists "Authenticated read focus_sessions" on public.focus_sessions;
drop policy if exists "Users read own sessions" on public.focus_sessions;
drop policy if exists "Users insert own sessions" on public.focus_sessions;
drop policy if exists "Users update own sessions" on public.focus_sessions;

create policy "Users read own sessions"
  on public.focus_sessions for select to authenticated
  using (user_id = auth.uid());

create policy "Users insert own sessions"
  on public.focus_sessions for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update own sessions"
  on public.focus_sessions for update to authenticated
  using (user_id = auth.uid());

create index if not exists focus_sessions_user_created_idx
  on public.focus_sessions (user_id, created_at desc);
