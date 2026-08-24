/**
 * Arabic text normalisation, mirroring the database's `normalize_ar(text)`.
 *
 * The same word is spelled several defensible ways — أحمد and احمد, كامري and
 * كامرى, فاطمة and فاطمه — and none of them is wrong. Anything that compares
 * Arabic strings has to fold those differences away first, or it reports that
 * two spellings of one name are two different names.
 *
 * This is a general utility, not a search helper: the rules are the database
 * function's rules, so a match found here is a match the database would find
 * too. Keep the two in step.
 */

// Order matters: marks come off before letters are folded, so a diacritic
// never blocks a letter substitution.

/** Fathatan through sukun, plus the superscript alef and the hamza marks. */
const DIACRITICS = /[ً-ٰٕ]/g
/** Kashida — a stretch of the baseline, never a letter. */
const TATWEEL = /ـ/g
/** أ إ آ ٱ → ا */
const ALEF_FORMS = /[آأإٱ]/g
/** ؤ → و */
const WAW_HAMZA = /ؤ/g
/** ئ → ي */
const YA_HAMZA = /ئ/g
/** ى → ي */
const ALEF_MAQSURA = /ى/g
/** ة → ه */
const TA_MARBUTA = /ة/g

export function normalizeAr(text: string): string {
  return text
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(ALEF_FORMS, 'ا')
    .replace(WAW_HAMZA, 'و')
    .replace(YA_HAMZA, 'ي')
    .replace(ALEF_MAQSURA, 'ي')
    .replace(TA_MARBUTA, 'ه')
}

/**
 * One comparable form for either script: Arabic folded, Latin lowercased,
 * runs of whitespace collapsed. Use this on both sides of any comparison
 * rather than normalising one side and forgetting the other.
 */
export function foldForSearch(text: string): string {
  return normalizeAr(text).toLowerCase().replace(/\s+/g, ' ').trim()
}
