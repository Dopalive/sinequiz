# SineQuiz v1 — Tasarım Spesifikasyonu

**Tarih:** 2026-10-03
**Durum:** Onaylandı (brainstorming oturumu)

## 1. Amaç ve kapsam

SineQuiz, dizi ve filmler hakkında bilgi yarışması sunan, gerçek kullanıcılara
açılacak bir mobil üründür. Sorular altyazı dosyaları ve Fandom wiki
sayfalarından LLM ile **tamamen otomatik** üretilir; insan onayı yoktur.
Kalite, otomatik doğrulama adımları ve kullanıcı bildirimleriyle korunur.

### v1 kapsamı

- Platform: **iOS + Android** (Expo). Web ikinci faz; aynı codebase `expo web`
  ile çıkar.
- Oyun döngüsü: **klasik quiz** — yapım seç, 10 soru, 4 şık, 15 sn süre,
  doğruya coin. Tek oyunculu.
- İçerik: **TR + EN**, ~20 popüler yapım (dizi + film). i18n altyapısı
  baştan; yeni dil/yapım eklemek pipeline'ı çalıştırmaktan ibaret.
- Coin: kazanılır ve **harcanır** (jokerler). Bakiye yalnızca sunucuda.
- Kimlik: **anonim başla**, Profile'dan Apple/Google ile bağla.

### v1 kapsam dışı (bilinçli)

Seviye haritası, canlı düello, liderlik tablosu, IAP/reklam, offline oyun,
kilitli içerik, push bildirim, YouTube transcript kaynağı (arayüz hazır,
uygulama yok).

## 2. Mimari

**Stack:** Expo (React Native + TypeScript, expo-router) · Supabase (Postgres,
Auth, Edge Functions, RLS) · TypeScript soru pipeline'ı (CLI) · Sentry.

### Repo yapısı (pnpm monorepo)

```
sinequiz/
├── apps/mobile/          # Expo uygulaması
├── packages/pipeline/    # Soru üretim CLI
├── packages/shared/      # DB tipleri, domain tipleri, coin sabitleri, saf kurallar
├── supabase/
│   ├── migrations/
│   ├── functions/        # start-session, submit-answer, finish-session, use-joker
│   └── seed.sql
└── docs/superpowers/     # spec & plan
```

### Veri akışı

1. **İçerik üretimi (offline):** `pipeline` geliştirici makinesinde çalışır,
   Supabase Postgres'e `titles / episodes / questions` yazar. Uygulama bu
   süreci bilmez.
2. **Oyun (online):** Uygulama soruları `questions_public` view'ından okur
   (doğru cevap **yok**). Cevap `submit-answer` Edge Function'a gider;
   sunucu doğrular, `coin_ledger`'a yazar, sonucu döner.
3. **Coin:** İstemci bakiye hesaplamaz; sunucu tek yetkili.

### Temel kararlar

- **Doğru cevap istemciye inmez.** Hile için paket dinlemek işe yaramaz.
  Bedeli: her cevapta bir ağ isteği (~100-200 ms); cevap animasyonu yutar.
- **Offline oyun yok** — yukarıdaki kararın sonucu.
- **Sorular dil bazında ayrı kayıt.** Çeviri değil, her dil için üretim;
  alıntı/kelime oyunu sorularında çeviri bozuluyor.

## 3. Veri modeli (Postgres)

### İçerik (pipeline yazar, uygulama okur)

| Tablo | Alanlar |
|---|---|
| `titles` | `id uuid pk`, `slug text unique`, `kind enum(series, movie)`, `tmdb_id int`, `poster_url text`, `release_year int`, `is_active bool`, `created_at` |
| `title_translations` | `title_id fk`, `locale text`, `name text`, `synopsis text`; pk `(title_id, locale)` |
| `episodes` | `id uuid pk`, `title_id fk`, `season int`, `number int`, `tmdb_id int`; filmde `season=0, number=0` tek satır; unique `(title_id, season, number)` |
| `questions` | `id uuid pk`, `title_id fk`, `episode_id fk null`, `locale text`, `prompt text`, `choices jsonb` (4 string), `correct_index smallint 0-3`, `difficulty smallint 1-3`, `source_ref text`, `is_active bool default true`, `report_count int default 0`, `created_at` |

### Oyun

| Tablo | Alanlar |
|---|---|
| `profiles` | `id uuid pk = auth.users.id`, `display_name text`, `locale text default 'en'`, `coin_balance int default 0`, `created_at` |
| `quiz_sessions` | `id uuid pk`, `user_id fk`, `title_id fk`, `locale text`, `question_ids uuid[]`, `status enum(in_progress, finished, abandoned)`, `score int default 0`, `started_at`, `finished_at null` |
| `answers` | `id uuid pk`, `session_id fk`, `question_id fk`, `chosen_index smallint null`, `is_correct bool`, `joker_used text null`, `answered_at`; unique `(session_id, question_id)` |
| `coin_ledger` | `id bigserial pk`, `user_id fk`, `delta int`, `reason text`, `ref_id uuid null`, `created_at` |
| `question_reports` | `question_id fk`, `user_id fk`, `reason text`, `created_at`; pk `(question_id, user_id)` |

### Kurallar

- `profiles.coin_balance` = `sum(coin_ledger.delta)`; `coin_ledger` insert
  trigger'ı günceller. Defter kaynak, bakiye cache.
- `questions_public` view: `correct_index` ve `source_ref` hariç, yalnız
  `is_active = true`. İstemci `questions` tablosuna doğrudan erişemez (RLS: hiç
  policy yok → erişim kapalı).
- `question_reports` insert trigger'ı `report_count` artırır; `>= 3` olunca
  `is_active = false`.
- Soru seçimi: kullanıcının son 30 günde doğru cevapladığı sorular hariç.
- `auth.users` insert trigger'ı `profiles` satırı oluşturur ve `coin_ledger`'a
  `+100 welcome` yazar.
- RLS: `profiles`, `quiz_sessions`, `answers`, `coin_ledger` kullanıcı yalnız
  kendi satırlarını okur; yazma yalnız Edge Function (service role).
  `question_reports` kullanıcı kendi adına insert edebilir.

## 4. Soru üretim pipeline'ı (`packages/pipeline`)

### CLI

```
pipeline add-title <tmdb_id>                 # metadata → titles/episodes/translations
pipeline fetch <slug>                        # kaynakları topla → data/<slug>/sources.json
pipeline extract <slug>                      # gerçekleri çıkar → data/<slug>/facts.json
pipeline generate <slug> --locale tr,en      # soru üret → data/<slug>/questions.<locale>.json
pipeline validate <slug> --locale tr,en      # doğrula → data/<slug>/validated.<locale>.json
pipeline publish <slug>                      # geçenleri DB'ye yaz
pipeline run <slug> --locale tr,en           # hepsi sırayla
```

Her adım kendi JSON dosyasını yazar; hata durumunda o adımdan devam edilir.
LLM yanıtları `zod` ile şema doğrulanır; bozuk JSON 2 kez tekrar denenir, sonra
o öğe atlanır ve loglanır.

### Adımlar

1. **Metadata:** TMDB API → ad, yıl, poster, bölüm listesi, TR/EN özet.
2. **Kaynak toplama:** Her kaynak `Source` arayüzünü uygular:
   `fetch(episode): Promise<Document[]>`, `Document = { text, kind, ref }`.
   - `SubtitleSource`: yerel `data/subs/<slug>/S01E01.srt|.stl`. Zaman kodları
     atılır, konuşmalar paragraflara birleştirilir.
   - `FandomSource`: Fandom MediaWiki API (`action=parse`) → bölüm özeti +
     ilgili karakter sayfaları. Sonraki bölümlere ait spoiler bölümleri
     kırpılır.
   - `YoutubeTranscriptSource`: arayüz var, v1'de implementasyon yok.
3. **Fact extraction:** LLM, dokümanlardan bölüm başına 20-40 atomik gerçek
   çıkarır; her biri `source_ref` taşır. Ayrıca yapım evreninden
   **entity havuzu** (karakter, yer, nesne adları) çıkarılır.
4. **Soru üretimi:** Her gerçek → hedef dilde 1 soru, 4 şık, zorluk 1-3.
   Çeldiriciler entity havuzundan seçtirilir; LLM yeni ad uydurmaz.
5. **Doğrulama (tamamı otomatik):**
   - *Bağımsız çözücü:* ikinci LLM çağrısı yalnız gerçekleri görür, soruyu
     çözer; cevap ≠ `correct_index` → at.
   - *Tek doğruluk:* üçüncü çağrı "birden fazla şık savunulabilir mi?" →
     evet → at.
   - *Dedupe:* prompt embedding cosine > 0.9 → at.
   - *Format:* 4 şık, hepsi farklı, prompt ≤ 200 karakter, şık ≤ 60 karakter.
6. **Publish:** Geçenler `questions`'a yazılır (`is_active = true`). Hedef:
   bölüm başına ≥ 10 soru/dil, yapım başına ≥ 100 soru/dil.

LLM: Anthropic SDK, model sabiti tek yerde (`packages/pipeline/src/llm.ts`).
Maliyet tahmini yapım başına 5-15 $.

## 5. Oyun akışı ve coin

### Ekranlar (expo-router)

`Home` (yapım grid'i + arama) → `TitleDetail` (özet, sezon seçimi dizide,
"Oyna") → `Quiz` (10 soru, 15 sn sayaç, joker barı) → `Result` (skor, kazanılan
coin, "Tekrar oyna" / "Başka yapım") → `Profile` (bakiye, istatistik, dil,
"Hesabını koru").

### Oturum

1. `start-session { title_id, season? }` → 10 soru seçer (son 30 günde doğru
   cevaplanmayanlar; zorluk dağılımı 3×1, 4×2, 3×3; yetersizse eldekiyle
   tamamlar), `quiz_sessions` yaratır, soruları public şekliyle döner.
2. `submit-answer { session_id, question_id, chosen_index | null }` →
   doğruluk, kazanılan coin, güncel bakiye döner. Süre dolarsa `null`.
   İdempotent: aynı `(session_id, question_id)` tekrar gelirse ilk sonuç
   döner, coin yazılmaz.
3. `use-joker { session_id, question_id, kind }` → bakiye yeterse düşer;
   `fifty_fifty` için sunucu iki yanlış şık index'i döner; `extra_time`
   istemciye +10 sn izni verir; `skip` soruyu `chosen_index=null,
   joker_used='skip'` olarak kapatır, coin kazandırmaz. Soru başına en fazla
   bir joker.
4. `finish-session { session_id }` → skor = doğru sayısı, bonuslar yazılır,
   `status=finished`.

Oturum 24 saat içinde bitmezse `abandoned` (cron / finish-session'da lazy).

### Coin sabitleri (`packages/shared/src/coins.ts`, sunucu uygular)

| Olay | Coin |
|---|---|
| Doğru cevap (zorluk 1-2) | +10 |
| Doğru cevap (zorluk 3) | +15 |
| Oturumu bitirme | +20 |
| 10/10 bonusu | +50 |
| Joker 50/50 | −30 |
| Joker +10 sn | −20 |
| Joker pas | −40 |
| Yeni kullanıcı | +100 |

Bakiye negatife düşemez; joker isteği yetersiz bakiyede `insufficient_coins`
hatası döner.

## 6. Auth ve i18n

- Açılışta `signInAnonymously()`. Trigger `profiles` + welcome coin yaratır.
- Profile'da "Hesabını koru" → `linkIdentity` (Apple, Google). Anonim
  kullanıcının uygulamayı silince coin'lerini kaybedeceği Profile'da açıkça
  yazılır.
- Uygulama metinleri: `i18next` + `expo-localization`, `locales/tr.json`,
  `locales/en.json`.
- Soru dili = `profiles.locale`; cihaz dilinden başlar, Profile'dan değişir.
  Bir yapımın o dilde `< 10` aktif sorusu varsa Home'da listelenmez.

## 7. Hata yönetimi

- Cevap gönderiminde ağ hatası: 3 deneme (exponential backoff), sonra
  "bağlantı yok" bar'ı. Oturum sunucuda `in_progress` kalır; aktif
  `session_id` `AsyncStorage`'da; uygulama açılınca kaldığı sorudan devam.
- Edge Function hataları tipli: `insufficient_coins`, `session_not_found`,
  `session_finished`, `question_not_in_session`, `already_answered`.
- Pipeline: adım bazlı yeniden başlatma; LLM şema hatası → 2 tekrar → atla.
- Sentry: mobil + Edge Functions.

## 8. Test stratejisi

- `shared`: coin hesabı, soru seçim dağılımı, format doğrulama kuralları —
  vitest birim testleri.
- `supabase/functions`: lokal Supabase'e karşı integration — idempotency,
  yetersiz bakiye, `questions_public`'in `correct_index` sızdırmadığı, RLS.
- `pipeline`: SRT/Fandom parser'ları fixture ile; LLM adımları kaydedilmiş
  yanıt (replay) ile; doğrulama kuralları saf fonksiyon.
- Mobil: Maestro ile tek E2E — anonim giriş → oyna → sonuç.

## 9. Başarı kriteri (v1 çıkışı)

- 20 yapım, her biri TR ve EN'de ≥ 100 aktif soru.
- Anonim kullanıcı 60 sn içinde ilk soruyu görür.
- Bildirim oranı (report / gösterim) < %2.
