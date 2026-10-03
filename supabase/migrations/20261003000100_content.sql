-- Content tables: written by the pipeline (service role), read by clients through questions_public.

create type title_kind as enum ('series', 'movie');

create table titles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind title_kind not null,
  tmdb_id integer,
  poster_url text,
  release_year integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table title_translations (
  title_id uuid not null references titles(id) on delete cascade,
  locale text not null,
  name text not null,
  synopsis text,
  primary key (title_id, locale)
);

create table episodes (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references titles(id) on delete cascade,
  season integer not null,
  number integer not null,
  tmdb_id integer,
  unique (title_id, season, number)
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  title_id uuid not null references titles(id) on delete cascade,
  episode_id uuid references episodes(id) on delete set null,
  locale text not null,
  prompt text not null,
  choices jsonb not null,
  correct_index smallint not null check (correct_index between 0 and 3),
  difficulty smallint not null check (difficulty between 1 and 3),
  source_ref text,
  is_active boolean not null default true,
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint questions_choices_four check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 4)
);
create index questions_title_locale_active_idx on questions (title_id, locale) where is_active;
create index questions_episode_idx on questions (episode_id);

-- Clients never see correct_index / source_ref.
create view questions_public
  with (security_invoker = false) as
  select id, title_id, episode_id, locale, prompt, choices, difficulty
  from questions
  where is_active = true;

-- RLS: content readable by everyone (anon + authenticated); questions table itself is locked.
alter table titles enable row level security;
alter table title_translations enable row level security;
alter table episodes enable row level security;
alter table questions enable row level security;

create policy "titles are public" on titles for select using (is_active);
create policy "title translations are public" on title_translations for select using (true);
create policy "episodes are public" on episodes for select using (true);
-- no select policy on questions => only service role can read it.

grant select on questions_public to anon, authenticated;
revoke all on questions from anon, authenticated;

-- Count of active questions per title & locale; Home hides titles with < 10.
create view title_question_counts
  with (security_invoker = false) as
  select title_id, locale, count(*)::integer as active_questions
  from questions
  where is_active = true
  group by title_id, locale;
grant select on title_question_counts to anon, authenticated;
