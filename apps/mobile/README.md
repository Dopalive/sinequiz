# SineQuiz mobile (`@sinequiz/mobile`)

Expo SDK 57 + expo-router uygulaması. Spec §5–7'yi uygular: anonim giriş → yapım seç → 10 soru / 15 sn /
jokerler → sonuç → profil. iOS, Android ve web aynı koddan çıkar; geliştirme döngüsü web üzerinden en hızlı.

## Çalıştırma

```bash
# repo kökünde lokal Supabase ayakta olmalı (README: pnpm supabase start / db reset / functions serve)
cp apps/mobile/.env.example apps/mobile/.env     # ANON_KEY: pnpm supabase status -o env
pnpm --filter @sinequiz/mobile web               # http://localhost:8081
pnpm --filter @sinequiz/mobile ios               # simülatör varsa
pnpm --filter @sinequiz/mobile typecheck
pnpm --filter @sinequiz/mobile lint
```

`.env` yalnız `EXPO_PUBLIC_*` değerleri taşır; ikisi de herkese açık anahtarlardır (RLS korur). Gizli anahtar
istemciye asla girmez.

## Yapı

```
src/
  app/              expo-router ekranları
    _layout.tsx     providers + auth gate + Stack
    index.tsx       Home: hero, "devam et", arama, yapım grid'i
    title/[id].tsx  TitleDetail: sezon seçimi, Oyna → start-session
    quiz/[sessionId].tsx  Quiz: sayaç, şıklar, joker barı, çıkış onayı
    result/[sessionId].tsx Result: skor, kazanılan coin, tekrar/başka
    profile.tsx     Profil: bakiye, dil, ses, istatistik, "hesabını koru"
  components/       Button, PressableScale, CoinBadge, TitleCard, TimerBar, ChoiceButton, Confetti, Hero, Notice, Screen
  lib/
    supabase.ts     tek client (AsyncStorage ile kalıcı oturum)
    auth.tsx        anonim bootstrap, profil, bakiye, dil; silinmiş kullanıcıda kendini yeniler
    api.ts          4 Edge Function için tipli sarmalayıcı; sadece ağ hatasında retry, 401'de oturumu düşürür
    titles.ts       katalog okumaları (titles + translations + title_question_counts, <10 soru gizli)
    session.ts      aktif oyunun AsyncStorage aynası (crash sonrası kaldığı sorudan devam)
    i18n.ts         i18next; src/locales/{tr,en}.json
    motion.ts       marka hareket kimliği: yay sabitleri, süre paleti, easing, stagger
    audio.tsx       ses katmanı: SFX, ambient döngü, kalıcı sessize alma (expo-audio)
  theme.ts          renk / aralık / tipografi
```

`@sinequiz/shared` workspace paketinden gelir: `coinsForAnswer`, `jokerCost`, `JOKER_KINDS` ve API tipleri.
İstemci doğruluk ya da coin hesaplamaz; sunucunun döndürdüğü sayıları gösterir.

## Hareket dili

`.claude/skills/motion-design` (LottieFiles) ilkeleriyle tek kişilik: **Energetic/Playful**. Girişler
`FadeInUp.springify()` + ~10% aşım, basma geri bildirimi sert yay, doğru cevap "pop" + konfeti, yanlış cevap
yatay sarsıntı (aşımsız), sayaç son 5 sn'de nefes alır, hero'daki küreler sinüs döngüsüyle süzülür. Sabitler
`src/lib/motion.ts` içinde; yeni bir animasyon eklerken oradan beslen.

## Ses

Efektler ve ambient döngü indirilmez, üretilir: `pnpm --filter @sinequiz/mobile gen:sfx`
(`scripts/gen-sfx.mjs`, bağımlılıksız Node) → `assets/sfx/*.wav` (16-bit mono 22050 Hz, toplam ~590 KB,
deterministik). Hareket diliyle aynı kişilik: kısa, parlak, arcade. Seviyeler dosyalara gömülü; ambient
(`ambient.wav`, 8 sn, A minör, dikişsiz döngü) çalışırken 0.25'e iner.

- `src/lib/audio.tsx`: `AudioProvider` + `useAudio()` → `play(name)`, `startAmbient()`, `stopAmbient()`,
  `muted`, `setMuted()`. Expo-audio üzerine; SFX oyuncuları önceden yüklenir, `tap` 3, `coin` 2 sesle üst üste
  çalabilir.
- Ambient Home ve Result odaklanınca başlar (fade-in), Quiz odaklanınca durur (fade-out; kısma değil, quiz
  sahnesi sayaç ve cevap seslerine ait). Uygulama arka plana geçince durur, dönünce devam eder.
- Sessize alma Profil → Ses (`sound-on` / `sound-off`), AsyncStorage `sinequiz.audio.muted.v1`. Kapalıyken
  ambient durur, efektler susar.
- iOS sessiz anahtarına ve Android sessiz/titreşim moduna uyulur (`playsInSilentMode: false`); kullanıcının
  kendi müziği kesilmez (`interruptionMode: "mixWithOthers"`).
- **Web autoplay:** tarayıcı ilk kullanıcı etkileşiminden önce `play()`'i reddeder (expo-audio'nun web
  oyuncusu bu reddi yakalamaz). Bu yüzden web'de oyuncular ilk tıklama/dokunma/tuşa kadar hiç yaratılmaz;
  sayfanın herhangi bir yerine ilk etkileşim sesi açar ve bekleyen ambient'i başlatır. iOS Safari programatik
  ses seviyesini yok sayar; ambient orada dosyadaki seviyede çalar.
- Bir ses dosyası yüklenemezse geliştirmede konsola `[audio] <ad>.wav failed to load/play` uyarısı düşer.
- Native: `expo-audio` native modül içerir; yeni bir development build gerekir (`npx expo run:ios|android`).

## Bilinçli eksikler

- Apple/Google ile hesap bağlama (`linkIdentity`) — Profil'de "yakında" olarak yazılı.
- Maestro E2E — testID'ler hazır (`title-<slug>`, `play`, `choice-<i>`, `joker-<kind>`, `next`, `quit`,
  `confirm-quit`, `open-profile`, `locale-<loc>`, `sound-on`, `sound-off`).
- Sentry.
- Poster görselleri `titles.poster_url` dolana kadar slug'dan türetilen gradyan + baş harfler.
