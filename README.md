# SineQuiz

Dizi/film bilgi yarışması. Spec: `docs/superpowers/specs/2026-10-03-sinequiz-v1-design.md`.

## Yapı

- `packages/shared` — saf domain kuralları (coin, soru seçimi, format, API tipleri). Sıfır bağımlılık.
- `supabase/` — şema (`migrations/`), seed, Edge Functions (`functions/`), entegrasyon testleri (`tests/`).
- `supabase/functions/_shared/shared/` — `packages/shared/src`'nin kopyası. Elle düzenleme; `pnpm sync:shared` çalıştır.
- `apps/mobile` — Expo (iOS/Android/web) uygulaması; bkz. `apps/mobile/README.md`.
- `packages/pipeline` (Plan 2) — henüz yok.
- `titles.json` — v1 yapım listesi ve her yapım için kaynak skill'lerinin argümanları (altyazı release adı, Fandom host/ad).
- `data/subs/<slug>/`, `data/fandom/<slug>/` — toplanan kaynaklar (şimdilik gitignored; `titles.json`'dan türetilir).
  `scripts/fetch-sources.sh` listedeki her yapım için eksikleri toplar, `scripts/fetch-sources.sh --status` ne var ne yok tablosunu basar.
  **Plan:** toplanan kayıtlar ilerde GitHub'a push edilecek (`.gitignore`'dan `data/` çıkarılıp commit'lenecek),
  böylece her checkout aynı kaynak setini görür ve altyazı sağlayıcılarına yeniden gidilmez.

## Kaynak skill'leri

Soru üretimi için ham metin iki Claude Code skill'iyle toplanır. İkisi de `.claude/skills/` altında,
`SKILL.md` ne zaman ve nasıl kullanılacağını anlatır; yardımcı betikler yanında durur.
Argümanlar `titles.json`'da yazılıdır; elle çağırmak yerine `scripts/fetch-sources.sh` tercih edilir.

| Skill | Ne yapar | Çıktı | Elle çağrı |
|---|---|---|---|
| `stl-download` | **subliminal** ile EN+TR SRT altyazı indirir; video dosyası ve hesap gerekmez. Release adı üretir, her eksik dosyayı WEB/BluRay/HDTV/DVDRip etiketleriyle yeniden dener, doğrular, BOM/CRLF temizler. | `data/subs/<slug>/S01E01.<lang>.srt`, film için `movie.<lang>.srt` | `.claude/skills/stl-download/fetch.sh fleabag "Fleabag" S01 1 6` |
| `fandom-fetch` | Fandom MediaWiki API'sinden bölüm özetleri ve karakter sayfalarını çeker, sonraki bölümlerin spoiler kısımlarını kırpar. | `data/fandom/<slug>/S01E01.json`, film için `movie.json` | `.claude/skills/fandom-fetch/fetch.py fleabag fleabag "Fleabag" S01 1 6` |

Kurallar:

- `MISS` çıkınca sıra: başlığa yıl/ülke ekle (`Dark.2017`, `The.Office.US`) → `PROVIDERS=ALL` → hâlâ yoksa dur ve MISS satırlarını raporla. Altyazı sitesi kazıma, hesap açma, tek sağlayıcının SSL/403 hatasını debug etme yok.
- `data/` altına elle dosya yazılmaz; düzen betiklerin ürettiği gibidir.
- Yeni yapım eklemek = `titles.json`'a bir kayıt eklemek, sonra `scripts/fetch-sources.sh <slug>`.

### Açık sağlayıcılarda bulunmayanlar

| Yapım | Denenen | Sonuç |
|---|---|---|
| **Gibi** (Exxen, 2021) | `Gibi` S01E01-12; `Gibi.2021`; `PROVIDERS=ALL` + `Gibi.2021`, dört kaynak etiketi | EN ve TR için tamamı MISS (2026-10-03). Yerel Türk yapımı; açık altyazı sağlayıcılarında yok. `data/subs/gibi/` boş, `titles.json`'a alınmadı. |

## Geliştirme

```bash
pnpm install
pnpm test                 # birim testler + sync kontrolü
colima start              # Docker
pnpm supabase start       # lokal Supabase (ilk seferde imaj indirir)
pnpm supabase db reset    # migration + seed
pnpm supabase functions serve   # ayrı terminalde
pnpm test:integration     # Edge Function + şema testleri
pnpm --filter @sinequiz/mobile web   # arayüz, http://localhost:8081 (önce apps/mobile/.env)
```

## Kurallar

- Doğru cevap istemciye inmez; istemci yalnız `questions_public` okur.
- Coin bakiyesi sunucuda; `coin_ledger` kaynak, `profiles.coin_balance` cache.
- Edge Function'lar `(session_id, question_id)` ve `session_id` için idempotent.
