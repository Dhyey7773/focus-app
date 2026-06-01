-- Matches your table exactly. Run in Supabase → SQL Editor.

create table if not exists public.focus_sessions (
  id bigint generated always as identity not null,
  duration integer null,
  interruptions integer null,
  completed boolean null,
  created_at timestamp without time zone null default now(),
  constraint focus_sessions_pkey primary key (id)
);

alter table public.focus_sessions enable row level security;

drop policy if exists "Authenticated insert focus_sessions" on public.focus_sessions;
drop policy if exists "Authenticated read focus_sessions" on public.focus_sessions;
drop policy if exists "Users read own sessions" on public.focus_sessions;
drop policy if exists "Users insert own sessions" on public.focus_sessions;

create policy "Authenticated insert focus_sessions"
  on public.focus_sessions
  for insert
  to authenticated
  with check (true);

create policy "Authenticated read focus_sessions"
  on public.focus_sessions
  for select
  to authenticated
  using (true);
