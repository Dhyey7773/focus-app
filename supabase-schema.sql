-- Quiet Focus — full focus_sessions schema + RLS
-- Run in Supabase → SQL Editor (safe to re-run)

create table if not exists public.focus_sessions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  task text default 'Focus session',
  focus_minutes integer default 0,
  focus_seconds integer default 0,
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
alter table public.focus_sessions add column if not exists focus_seconds integer default 0;
alter table public.focus_sessions add column if not exists distractions integer default 0;
alter table public.focus_sessions add column if not exists breaks integer default 0;
alter table public.focus_sessions add column if not exists refocuses integer default 0;
alter table public.focus_sessions add column if not exists score integer default 0;
alter table public.focus_sessions add column if not exists completed_naturally boolean default false;
alter table public.focus_sessions add column if not exists events jsonb default '[]'::jsonb;
alter table public.focus_sessions add column if not exists date date default (current_date);
alter table public.focus_sessions add column if not exists client_session_id text;

create unique index if not exists focus_sessions_user_client_session_idx
  on public.focus_sessions (user_id, client_session_id)
  where client_session_id is not null;

-- Backfill seconds from minutes where missing
update public.focus_sessions
set focus_seconds = coalesce(nullif(focus_seconds, 0), focus_minutes * 60, 0)
where focus_seconds is null or focus_seconds = 0;

-- Migrate legacy columns only if an old table still has them
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'focus_sessions' and column_name = 'duration'
  ) then
    execute $sql$
      update public.focus_sessions
      set focus_minutes = coalesce(focus_minutes, duration, 0)
      where focus_minutes is null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'focus_sessions' and column_name = 'interruptions'
  ) then
    execute $sql$
      update public.focus_sessions
      set distractions = coalesce(distractions, interruptions, 0)
      where distractions is null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'focus_sessions' and column_name = 'completed'
  ) then
    execute $sql$
      update public.focus_sessions
      set completed_naturally = coalesce(completed_naturally, completed, false)
      where completed_naturally is null
    $sql$;
  end if;
end $$;

alter table public.focus_sessions enable row level security;

-- Block anonymous access; only signed-in users can read/write their own rows
revoke all on table public.focus_sessions from anon;
grant select, insert, update on table public.focus_sessions to authenticated;

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

-- Rate limit: max 30 session saves per user per hour (anti-abuse)
create or replace function public.enforce_focus_session_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.focus_sessions
  where user_id = new.user_id
    and created_at > now() - interval '1 hour';

  if recent_count >= 30 then
    raise exception 'Too many sessions saved this hour. Try again later.';
  end if;

  return new;
end;
$$;

drop trigger if exists focus_sessions_rate_limit on public.focus_sessions;
create trigger focus_sessions_rate_limit
  before insert on public.focus_sessions
  for each row execute function public.enforce_focus_session_rate_limit();

-- ─── Assignments (for reminders + cloud sync) ───
create table if not exists public.assignments (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  course text default '',
  due_at timestamptz not null,
  estimated_minutes integer default 60,
  completed boolean default false,
  completed_at timestamptz,
  snoozed_until timestamptz,
  reminders_shown jsonb default '{"h24":false,"h6":false,"h1":false}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.assignments enable row level security;
revoke all on table public.assignments from anon;
grant select, insert, update, delete on table public.assignments to authenticated;

drop policy if exists "Users read own assignments" on public.assignments;
drop policy if exists "Users insert own assignments" on public.assignments;
drop policy if exists "Users update own assignments" on public.assignments;
drop policy if exists "Users delete own assignments" on public.assignments;

create policy "Users read own assignments"
  on public.assignments for select to authenticated
  using (user_id = auth.uid());

create policy "Users insert own assignments"
  on public.assignments for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update own assignments"
  on public.assignments for update to authenticated
  using (user_id = auth.uid());

create policy "Users delete own assignments"
  on public.assignments for delete to authenticated
  using (user_id = auth.uid());

create index if not exists assignments_user_due_idx
  on public.assignments (user_id, due_at);

-- ─── Web Push subscriptions ───
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

drop policy if exists "Users read own push subs" on public.push_subscriptions;
drop policy if exists "Users insert own push subs" on public.push_subscriptions;
drop policy if exists "Users update own push subs" on public.push_subscriptions;
drop policy if exists "Users delete own push subs" on public.push_subscriptions;

create policy "Users read own push subs"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create policy "Users insert own push subs"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update own push subs"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid());

create policy "Users delete own push subs"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ─── Contact / support form (insert only from app; read in Supabase dashboard) ───
create table if not exists public.contact_messages (
  id bigint generated always as identity primary key,
  name text not null default '',
  email text not null,
  topic text not null default 'general',
  message text not null,
  created_at timestamptz default now()
);

alter table public.contact_messages enable row level security;
revoke all on table public.contact_messages from anon, authenticated;
grant insert on table public.contact_messages to anon, authenticated;

drop policy if exists "Anyone can submit contact" on public.contact_messages;
create policy "Anyone can submit contact"
  on public.contact_messages for insert to anon, authenticated
  with check (
    char_length(trim(email)) >= 5
    and char_length(trim(message)) >= 8
    and char_length(message) <= 2000
  );

create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);
