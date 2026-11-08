import { de } from "./de";
import { en, type TranslationKey, type Translations } from "./en";

export type { TranslationKey };

const DICTIONARIES: Record<string, Translations> = { de, en };

/** Pick the dictionary for a Home Assistant language code such as "de" or "de-CH". */
export function dictionaryFor(language: string | undefined): Translations {
  const base = (language ?? "en").toLowerCase().split("-")[0] ?? "en";
  return DICTIONARIES[base] ?? en;
}

export type Localize = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Create a localize function for one language. Unknown placeholders stay visible. */
export function createLocalize(language: string | undefined): Localize {
  const dict = dictionaryFor(language);
  return (key, params) => {
    const template = dict[key] ?? en[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}
