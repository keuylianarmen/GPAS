/**
 * Placeholder parity between the string catalogues.
 *
 * ── WHAT THIS CHECKS ────────────────────────────────────────────────────
 *
 * One rule: every `{token}` in an Arabic value must exist in the English
 * value for the same key.
 *
 * That direction is decidable. A token in the Arabic that English does not
 * have can never be filled — `t()` and `tn()` substitute from the params the
 * call site passes, and the call site was written against the English string
 * — so it renders to the user as a literal `{count}`. There is no wording in
 * which that is correct, which is why it can be a build failure with no
 * allowlist and no judgement.
 *
 * It catches two faults that keep recurring:
 *
 *   renamed token   en 'Job #{number}'   ar 'أمر عمل #{n}'
 *                   → {n} is unfillable; the number never appears
 *
 *   extra token     en 'Now at'          ar 'حاليًا عند {km} كم'
 *                   → the English is a fragment with the value rendered
 *                     beside it in JSX; the Arabic embeds a token nothing
 *                     fills, and the value then prints twice
 *
 * ── WHAT THIS DELIBERATELY DOES NOT CHECK ───────────────────────────────
 *
 * The opposite direction — a token in the English that the Arabic lacks — is
 * NOT a failure here, and a green run does NOT mean the catalogues agree.
 *
 * It is left out because it is not decidable by a script:
 *
 *   1. Arabic's singular and dual name the quantity in the word itself.
 *      'مركبتان' means "two vehicles"; inserting {count} would render
 *      "2 two-vehicles". Roughly twenty keys are correct precisely because
 *      they omit the token.
 *
 *   2. A translator may legitimately reword rather than interpolate.
 *      'إزالة المركبة من الأمر؟' for "Remove {vehicle} from this job?" says
 *      less than the English but is grammatical and deliberate. Whether that
 *      is acceptable is an editorial call, not a mechanical one.
 *
 * As of the audit that prompted this script, seventeen keys are in that
 * state and need an Arabic speaker, not a linter. Their categories were
 * labelled A and C. **A passing run says nothing about them.** If you are
 * reading this because you assumed a green check meant the catalogues were
 * clean: it does not, and it never claimed to.
 *
 * Keys missing from Arabic entirely are already a TypeScript error —
 * `Catalogue` is `Record<StringKey, string>`, derived from the English
 * catalogue — so this script does not repeat that check.
 *
 * Run: node --experimental-strip-types scripts/check-strings.mjs
 */
import { en } from '../src/lib/strings.en.ts'
import { ar } from '../src/lib/strings.ar.ts'

/** CLDR plural categories. Arabic uses all six; English uses two. */
const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']

const tokensIn = (value) =>
  [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1])

/** `stats.times.few` → `stats.times`, and null for a key that is not a form. */
function pluralBase(key) {
  const cut = key.lastIndexOf('.')
  if (cut < 1) return null
  return FORMS.includes(key.slice(cut + 1)) ? key.slice(0, cut) : null
}

/**
 * The English string a given Arabic key is measured against. Arabic has
 * plural categories English does not, and `tn()` falls back to `base.other`
 * for those — so that is the string whose tokens they may use.
 */
function englishFor(key) {
  if (key in en) return key
  const base = pluralBase(key)
  const fallback = base && `${base}.other`
  return fallback && fallback in en ? fallback : null
}

const failures = []

for (const [key, value] of Object.entries(ar)) {
  // Empty Arabic falls back to English by design — nothing to compare.
  if (String(value).trim() === '') continue

  const reference = englishFor(key)
  // An Arabic key with no English counterpart at all is out of scope here.
  if (!reference) continue

  const allowed = new Set(tokensIn(en[reference]))
  const unfillable = [...new Set(tokensIn(value))].filter(
    (token) => !allowed.has(token),
  )
  if (unfillable.length === 0) continue

  failures.push({ key, reference, value, unfillable, allowed: [...allowed] })
}

if (failures.length === 0) {
  console.log(
    `strings: ${failures.length === 0 ? 'ok' : ''} — no unfillable placeholders in ${
      Object.keys(ar).length
    } Arabic values`,
  )
  process.exit(0)
}

console.error(
  `\nstrings: ${failures.length} Arabic ${
    failures.length === 1 ? 'value has a placeholder' : 'values have placeholders'
  } the English cannot fill\n`,
)

for (const failure of failures) {
  console.error(`  ${failure.key}`)
  if (failure.reference !== failure.key) {
    console.error(`    (measured against ${failure.reference})`)
  }
  console.error(`    en: ${JSON.stringify(en[failure.reference])}`)
  console.error(`    ar: ${JSON.stringify(failure.value)}`)
  console.error(
    `    unfillable: ${failure.unfillable.map((t) => `{${t}}`).join(' ')}` +
      `   en offers: ${
        failure.allowed.length ? failure.allowed.map((t) => `{${t}}`).join(' ') : '(none)'
      }`,
  )
  console.error('')
}

console.error(
  'Each renders to the user as a literal token. Either rename it to match the\n' +
    'English, or move the value into the string in both languages and pass it\n' +
    'as a param. See the header of this file for what is NOT checked.\n',
)

process.exit(1)
