// src/Translations.ts
import { SupportedLanguage } from './Types.js';
import { bg, TranslationKeys } from './locales/bg.js';
import { en } from './locales/en.js';

// Map the dictionaries to the SupportedLanguage type
const dictionaries: Record<SupportedLanguage, TranslationKeys> = {
    bg: bg,
    en: en
};

export function t(key: keyof TranslationKeys, lang: SupportedLanguage): string {
    return dictionaries[lang][key];
}