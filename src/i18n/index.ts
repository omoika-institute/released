import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import deTranslation from "./resources/de/translation";
import enTranslation from "./resources/en/translation";
import esTranslation from "./resources/es/translation";
import frTranslation from "./resources/fr/translation";
import jaTranslation from "./resources/ja/translation";
import ukTranslation from "./resources/uk/translation";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  isSupportedLanguage,
  resolveSupportedLanguage,
} from "./languages";

function getInitialLanguage() {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;

  return resolveSupportedLanguage(
    window.localStorage.getItem("i18nextLng") ?? window.navigator.language
  );
}

function applyDocumentLanguage(language: string) {
  if (typeof document === "undefined") return;

  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
}

async function hydratePersistedLanguage() {
  if (typeof window === "undefined" || !window.api?.settings?.get) return;

  try {
    const settings = await window.api.settings.get();
    if (!isSupportedLanguage(settings.language)) return;

    const language = resolveSupportedLanguage(settings.language);
    if (language === resolveSupportedLanguage(i18n.resolvedLanguage)) return;

    await i18n.changeLanguage(language);
  } catch (error) {
    console.error("Failed to restore persisted language setting:", error);
  }
}

if (!i18n.isInitialized) {
  const initPromise = i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        de: {
          translation: deTranslation,
        },
        en: {
          translation: enTranslation,
        },
        es: {
          translation: esTranslation,
        },
        fr: {
          translation: frTranslation,
        },
        ja: {
          translation: jaTranslation,
        },
        uk: {
          translation: ukTranslation,
        },
      },
      lng: getInitialLanguage(),
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: LANGUAGE_OPTIONS.map((option) => option.value),
      load: "languageOnly",
      nonExplicitSupportedLngs: true,
      defaultNS: "translation",
      ns: ["translation"],
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ["querystring", "localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
      },
      returnEmptyString: false,
    });

  void initPromise.then(() => {
    applyDocumentLanguage(resolveSupportedLanguage(i18n.resolvedLanguage));
    i18n.on("languageChanged", (language) => {
      applyDocumentLanguage(resolveSupportedLanguage(language));
    });
    return hydratePersistedLanguage();
  });
}

export default i18n;
