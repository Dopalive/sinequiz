# Plan 1 — Review bulguları ve takip listesi

Plan 1 (backend temeli) `plan1-backend` dalında 11 görev + 2 düzeltme turu ile
tamamlandı; her görev ayrı review'dan, dal bütünü final review'dan geçti.
Son durum: shared 28/28, Deno 9/9, entegrasyon 53/53.

## Düzeltilenler (merge öncesi)

- **Coin ödeyen mutasyonlar transaction'sızdı** (submit-answer, use-joker,
  finish-session birden fazla autocommit PostgREST çağrısı yapıyordu; arada hata
  → coin kalıcı kayıp, replay telafi edemiyordu). → Üç plpgsql RPC
  (`submit_answer`, `use_joker`, `finish_session`), oturum satırı `for update`
  ile kilitlenir; Edge Function'lar auth + validation + coin miktarı hesaplar.
  Migration `20261003000300_game_rpc.sql`.
- **`questions_public` anon key ile yazılabilirdi** (auto-updatable view,
  `security_invoker=false`, Supabase varsayılan ALL grant'i). → Tüm client
  rollerinden view/tablo yazma yetkileri alındı; yalnız `question_reports`
  insert ve `profiles(display_name, locale)` update açık. Default privileges
  de kısıldı. Migration `20261003000400_harden_grants.sql`.
- `fifty_fifty` tekrar çağrıda idempotent (aynı çift, tek ücret; HMAC seed).
- 30 günlük hariç tutma sorgusu yapım bazında (PostgREST max_rows sınırı).
- `coin_ledger` append-only trigger; `profiles` locale/display_name check'leri.
- CI pnpm sürüm çakışması; `deno check` CI'a eklendi.
- `enable_manual_linking = true` (anonim → Apple/Google bağlama için şart).

## Takip (merge sonrası, Plan 2/3 öncesi veya sırasında)

1. **Soru devre dışı bırakma istismarı:** 3 anonim kullanıcı herhangi bir
   soruyu kapatabilir. Önlem: bildirim için bağlı kimlik şartı veya kullanıcı
   başına rate limit, ya da `>= 3` → inceleme kuyruğu. (`supabase/README.md`)
2. `coin_ledger` için `revoke truncate from service_role` (row trigger TRUNCATE'i
   yakalamaz).
3. `fifty_fifty` HMAC anahtarı için ayrı `FIFTY_FIFTY_SECRET` (service-role key
   rotasyonu uçuştaki çiftleri değiştirir).
4. Home için tek view: `titles_home` (titles ⋈ translations ⋈ counts,
   `titles.is_active` filtreli). Şu an `questions_public` ve
   `title_question_counts` inaktif yapımı gizlemiyor.
5. Aynı kullanıcı için eşzamanlı birden fazla `in_progress` oturum engeli
   (partial unique index) veya "açık oturuma devam et" semantiği.
6. `pickQuestions`: tie-break testi, tam sayı olmayan `total` guard'ı;
   `validateQuestionFormat`: string olmayan `prompt`.
7. `content.sql`'de `locale` check constraint; `COINS.WELCOME` değerinin
   trigger'daki `100` ile tek kaynaktan gelmesi.
8. `supabase/config.toml` **config push öncesi** kontrol listesi:
   `anonymous_users` → 30, `site_url`/redirect'ler, `major_version`,
   `enable_manual_linking`. (`supabase/README.md`)
