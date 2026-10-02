-- Game tables: written only by Edge Functions (service role); users read their own rows.
create type session_status as enum ('in_progress', 'finished', 'abandoned');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'en',
  coin_balance integer not null default 0 check (coin_balance >= 0),
  created_at timestamptz not null default now()
);

create table quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title_id uuid not null references titles(id),
  locale text not null,
  question_ids uuid[] not null,
  status session_status not null default 'in_progress',
  score integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index quiz_sessions_user_idx on quiz_sessions (user_id, status);

create table answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  question_id uuid not null references questions(id),
  chosen_index smallint check (chosen_index between 0 and 3),
  is_correct boolean not null,
  joker_used text,
  answered_at timestamptz not null default now(),
  unique (session_id, question_id)
);
create index answers_question_idx on answers (question_id);

-- One joker per question per session, recorded before the answer arrives.
create table session_jokers (
  session_id uuid not null references quiz_sessions(id) on delete cascade,
  question_id uuid not null references questions(id),
  kind text not null check (kind in ('fifty_fifty', 'extra_time', 'skip')),
  created_at timestamptz not null default now(),
  primary key (session_id, question_id)
);

create table coin_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index coin_ledger_user_idx on coin_ledger (user_id, created_at desc);

create table question_reports (
  question_id uuid not null references questions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

-- Trigger: ledger insert -> balance cache. The check constraint on profiles rejects negatives atomically.
create or replace function coin_ledger_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set coin_balance = coin_balance + new.delta where id = new.user_id;
  return new;
end $$;
create trigger coin_ledger_apply after insert on coin_ledger
  for each row execute function coin_ledger_apply();

-- Trigger: new auth user -> profile + welcome coins.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id);
  insert into coin_ledger (user_id, delta, reason) values (new.id, 100, 'welcome');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Trigger: report -> report_count, auto-deactivate at 3.
create or replace function question_reports_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update questions
     set report_count = report_count + 1,
         is_active = case when report_count + 1 >= 3 then false else is_active end
   where id = new.question_id;
  return new;
end $$;
create trigger question_reports_count after insert on question_reports
  for each row execute function question_reports_count();

-- RLS
alter table profiles enable row level security;
alter table quiz_sessions enable row level security;
alter table answers enable row level security;
alter table session_jokers enable row level security;
alter table coin_ledger enable row level security;
alter table question_reports enable row level security;

create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
-- Column-level: users may change display_name and locale only.
revoke update on profiles from authenticated;
grant update (display_name, locale) on profiles to authenticated;

create policy "read own sessions" on quiz_sessions for select using (auth.uid() = user_id);
create policy "read own answers" on answers for select
  using (exists (select 1 from quiz_sessions s where s.id = answers.session_id and s.user_id = auth.uid()));
create policy "read own jokers" on session_jokers for select
  using (exists (select 1 from quiz_sessions s where s.id = session_jokers.session_id and s.user_id = auth.uid()));
create policy "read own ledger" on coin_ledger for select using (auth.uid() = user_id);
create policy "report as self" on question_reports for insert with check (auth.uid() = user_id);
create policy "read own reports" on question_reports for select using (auth.uid() = user_id);

-- Default user_id on reports so clients send only question_id + reason.
alter table question_reports alter column user_id set default auth.uid();
