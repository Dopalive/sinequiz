import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import tr from "../locales/tr.json";

export const SUPPORTED_LOCALES = ["tr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Device language narrowed to what we ship; English otherwise. */
export function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode ?? "en";
  return isLocale(code) ? code : "en";
}

// Initialized synchronously so the first render already has strings.
// eslint-disable-next-line import/no-named-as-default-member -- the documented i18next bootstrap
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, tr: { translation: tr } },
  lng: deviceLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
