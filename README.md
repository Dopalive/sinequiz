# SineQuiz

Dizi/film bilgi yarışması. Spec: `docs/superpowers/specs/2026-10-03-sinequiz-v1-design.md`.

## Yapı

- `packages/shared` — saf domain kuralları (coin, soru seçimi, format, API tipleri). Sıfır bağımlılık.
- `supabase/` — şema (`migrations/`), seed, Edge Functions (`functions/`), entegrasyon testleri (`tests/`).
- `supabase/functions/_shared/shared/` — `packages/shared/src`'nin kopyası. Elle düzenleme; `pnpm sync:shared` çalıştır.
- `packages/pipeline` (Plan 2), `apps/mobile` (Plan 3) — henüz yok.

## Geliştirme

```bash
pnpm install
pnpm test                 # birim testler + sync kontrolü
colima start              # Docker
pnpm supabase start       # lokal Supabase (ilk seferde imaj indirir)
pnpm supabase db reset    # migration + seed
pnpm supabase functions serve   # ayrı terminalde
pnpm test:integration     # Edge Function + şema testleri
```

## Kurallar

- Doğru cevap istemciye inmez; istemci yalnız `questions_public` okur.
- Coin bakiyesi sunucuda; `coin_ledger` kaynak, `profiles.coin_balance` cache.
- Edge Function'lar `(session_id, question_id)` ve `session_id` için idempotent.
