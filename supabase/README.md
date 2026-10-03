# supabase/

SineQuiz backend: Postgres migration'ları (`migrations/`), Edge Function'lar (`functions/`) ve entegrasyon testleri (`tests/`).

## Çalıştırma ve testler

Repo kökünden:

```bash
pnpm install
pnpm test                 # birim testler + sync kontrolü
colima start              # Docker
pnpm supabase start       # lokal Supabase (ilk seferde imaj indirir)
pnpm supabase db reset    # migration + seed
pnpm supabase functions serve   # ayrı terminalde
pnpm test:integration     # Edge Function + şema testleri
pnpm test:all             # birim + typecheck + deno check + deno test
```

`config.toml` değişirse `pnpm supabase stop && pnpm supabase start`, ardından `functions serve` yeniden başlatılır.

## `config push` öncesi kontrol listesi

`config.toml` lokal geliştirme için ayarlı; hosted projeye göndermeden önce:

- [ ] `[auth.rate_limit] anonymous_users` → **30**'a geri çekildi (lokalde test suite için 1000).
- [ ] `[auth] site_url` ve `additional_redirect_urls` gerçek uygulama URL'leri / deep link şemasıyla değiştirildi.
- [ ] `[db] major_version` uzak projenin Postgres sürümüyle aynı.
- [ ] `[auth] enable_manual_linking = true` (anonim → Apple/Google `linkIdentity` için gerekli).

## Bilinen v1 riski

3 anonim kullanıcı herhangi bir soruyu devre dışı bırakabilir: `question_reports` sayısı 3'e ulaşınca
`questions.is_active = false` olur ve anonim hesap açmak ucuzdur. Plan 3 öncesi önlem: bildirim için bağlı
kimlik (Apple/Google) şartı veya kullanıcı başına rate limit.
