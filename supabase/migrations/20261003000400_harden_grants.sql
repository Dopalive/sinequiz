-- Hardening after the whole-branch review.

-- Views are owner-executed (security_invoker = false); default privileges granted ALL. Keep them read-only.
revoke insert, update, delete, truncate, references, trigger on questions_public from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on title_question_counts from anon, authenticated;
-- Defense in depth: clients never write game/content tables directly except the two allowed paths.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant insert on question_reports to authenticated;
grant update (display_name, locale) on profiles to authenticated;
-- Future tables/views: do not hand ALL to client roles by default.
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;

-- coin_ledger is append-only: balances are a cache of the ledger, so history must never be rewritten,
-- not even by the service role. The one exception is the FK cascade when the owning profile (auth user)
-- is deleted: by the time the cascaded delete reaches the ledger the profile row is already gone, so
-- account deletion keeps working.
create function coin_ledger_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from profiles p where p.id = old.user_id) then
    return old;
  end if;
  raise exception 'coin_ledger is append-only';
end $$;
create trigger coin_ledger_append_only before update or delete on coin_ledger
  for each row execute function coin_ledger_append_only();

alter table profiles
  add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 40),
  add constraint profiles_locale_fmt check (locale ~ '^[a-z]{2}$');
