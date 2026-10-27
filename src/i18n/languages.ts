export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "ja", label: "日本語" },
  { value: "uk", label: "Українська" },
] as const;

export type SupportedLanguage = (typeof LANGUAGE_OPTIONS)[number]["value"];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export function isSupportedLanguage(
  language: string | null | undefined
): language is SupportedLanguage {
  return LANGUAGE_OPTIONS.some((option) => option.value === language);
}

export function resolveSupportedLanguage(
  language: string | null | undefined
): SupportedLanguage {
  if (isSupportedLanguage(language)) return language;

  const baseLanguage = language?.split("-")[0];
  if (isSupportedLanguage(baseLanguage)) return baseLanguage;

  return DEFAULT_LANGUAGE;
}

export function getLanguageLabel(language: string) {
  return (
    LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ??
    LANGUAGE_OPTIONS[0].label
  );
}
