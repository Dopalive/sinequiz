-- Deterministic seed for local dev and integration tests.
insert into titles (id, slug, kind, tmdb_id, release_year) values
  ('00000000-0000-0000-0000-000000000001', 'breaking-bad', 'series', 1396, 2008);

insert into title_translations (title_id, locale, name, synopsis) values
  ('00000000-0000-0000-0000-000000000001', 'en', 'Breaking Bad', 'A chemistry teacher turns to cooking meth.'),
  ('00000000-0000-0000-0000-000000000001', 'tr', 'Breaking Bad', 'Bir kimya öğretmeni met üretmeye başlar.');

insert into episodes (id, title_id, season, number) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 1, 1),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 1, 2);

-- 15 questions per episode per locale: 5 of each difficulty. correct_index = i % 4.
insert into questions (title_id, episode_id, locale, prompt, choices, correct_index, difficulty, source_ref)
select
  '00000000-0000-0000-0000-000000000001',
  case when i <= 15 then '00000000-0000-0000-0000-000000000011' else '00000000-0000-0000-0000-000000000012' end::uuid,
  loc,
  format('%s seed question #%s', loc, i),
  jsonb_build_array(format('A%s', i), format('B%s', i), format('C%s', i), format('D%s', i)),
  (i % 4),
  ((i - 1) % 3) + 1,
  format('seed:%s', i)
from generate_series(1, 30) as i, unnest(array['en', 'tr']) as loc;
