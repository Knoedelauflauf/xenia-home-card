import * as en from "./translations/en.json";
import * as de from "./translations/de.json";

const languages: Record<string, unknown> = {
  en,
  de,
};

const DEFAULT_LANG = "en";

function getNestedValue(obj: unknown, path: string): string | undefined {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

export function localize(key: string, language?: string): string {
  const lang = language?.split("-")[0] || DEFAULT_LANG;

  const value = getNestedValue(languages[lang], key);
  if (value) return value;

  if (lang !== DEFAULT_LANG) {
    const fallback = getNestedValue(languages[DEFAULT_LANG], key);
    if (fallback) return fallback;
  }

  return key;
}
