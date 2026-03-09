// tests/Translations.test.ts
import { describe, it, expect } from 'vitest';
import { bg } from '../src/locales/bg.js';
import { en } from '../src/locales/en.js';

describe('Translation Dictionaries', () => {

    it('should have the exact same keys in both Bulgarian and English dictionaries', () => {
        const bgKeys = Object.keys(bg).sort();
        const enKeys = Object.keys(en).sort();

        // Find keys that are in BG but missing in EN
        const missingInEn = bgKeys.filter(key => !enKeys.includes(key));

        // Find keys that are in EN but missing in BG
        const extraInEn = enKeys.filter(key => !bgKeys.includes(key));

        // We use descriptive error messages so if it fails, you know exactly which key to fix!
        expect(missingInEn, `English dictionary is missing these keys: ${missingInEn.join(', ')}`).toEqual([]);
        expect(extraInEn, `English dictionary has extra keys not found in Bulgarian: ${extraInEn.join(', ')}`).toEqual([]);
    });

    it('should not have any empty translation strings in English', () => {
        const emptyEnKeys = Object.entries(en)
            .filter(([_, value]) => value.trim() === '')
            .map(([key]) => key);

        expect(emptyEnKeys, `These English keys have empty string values: ${emptyEnKeys.join(', ')}`).toEqual([]);
    });

    it('should not have any empty translation strings in Bulgarian', () => {
        const emptyBgKeys = Object.entries(bg)
            .filter(([_, value]) => value.trim() === '')
            .map(([key]) => key);

        expect(emptyBgKeys, `These Bulgarian keys have empty string values: ${emptyBgKeys.join(', ')}`).toEqual([]);
    });
});