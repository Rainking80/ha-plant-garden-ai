import type { Localize, TranslationKey } from "../i18n";

/** Tags with a fixed meaning, stored language-neutral. "problem" is used by the assistant. */
export const PRESET_TAGS = ["development", "problem", "flowering", "harvest"] as const;

export function tagLabel(tag: string, t: Localize): string {
  return (PRESET_TAGS as readonly string[]).includes(tag) ? t(`tag.${tag}` as TranslationKey) : tag;
}

export function toggleTag(tags: string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
}
