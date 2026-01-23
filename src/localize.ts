import * as en from "./translations/en.json";
import * as de from "./translations/de.json";

const languages: Record<string, Record<string, Record<string, string>>> = {
  en,
  de,
};

const DEFAULT_LANG = "en";

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return typeof current === "string" ? current : undefined;
}

export function localize(key: string, language?: string): string {
  const lang = language?.split("-")[0] || DEFAULT_LANG;

  // Try requested language
  const translations = languages[lang];
  if (translations) {
    const value = getNestedValue(translations as unknown as Record<string, unknown>, key);
    if (value) return value;
  }

  // Fallback to English
  if (lang !== DEFAULT_LANG) {
    const fallback = languages[DEFAULT_LANG];
    if (fallback) {
      const value = getNestedValue(fallback as unknown as Record<string, unknown>, key);
      if (value) return value;
    }
  }

  // Return key if nothing found
  return key;
}
