import { FunctionsHttpError } from '@supabase/functions-js'
import { supabase } from './supabase'
import { t } from './i18n'

export type TranslationResult =
  | { translation: string; direction: string | null }
  | { error: string }

type RequestBody = {
  name: string
  categoryId?: number
  mode?: 'transliterate'
}

/**
 * One call to the translate-service edge function. `invoke` attaches the
 * session token, which the function requires.
 *
 * The caller decides what to do with the answer — nothing here writes it
 * anywhere. These names reach customers in reminders, so a machine-produced
 * name is always something a person has seen and accepted.
 */
async function callTranslateService(
  body: RequestBody,
  emptyMessage: string,
  timeout?: number,
): Promise<TranslationResult> {
  const { data, error } = await supabase.functions.invoke('translate-service', {
    body,
    timeout,
  })

  if (error) {
    // A non-2xx carries the function's own { error } in the response body,
    // which is more useful than the generic "non-2xx status code".
    if (error instanceof FunctionsHttpError) {
      try {
        const body: unknown = await error.context.json()
        if (
          body !== null &&
          typeof body === 'object' &&
          'error' in body &&
          typeof body.error === 'string'
        ) {
          return { error: body.error }
        }
      } catch {
        // Body was not JSON; fall through to the transport message.
      }
    }
    return { error: error.message }
  }

  const payload: unknown = data
  if (
    payload === null ||
    typeof payload !== 'object' ||
    !('translation' in payload) ||
    typeof payload.translation !== 'string' ||
    payload.translation.trim() === ''
  ) {
    return { error: emptyMessage }
  }

  const direction =
    'direction' in payload && typeof payload.direction === 'string'
      ? payload.direction
      : null

  return { translation: payload.translation.trim(), direction }
}

/**
 * Asks for the other-language name of a service. Meaning crosses over here —
 * غسيل الردييتر is a radiator flush — which is what makes this the wrong call
 * for a person's name.
 */
export async function translateServiceName(
  name: string,
  categoryId: number,
): Promise<TranslationResult> {
  return callTranslateService({ name, categoryId }, t('serviceForm.translateEmpty'))
}

/**
 * A blur in a form is not worth waiting on. Six seconds is long enough for the
 * round trip and short enough that nobody watches an empty field wondering.
 */
const SUGGEST_TIMEOUT_MS = 6000

/**
 * The other spelling of a customer's name, or null when there isn't one to
 * offer. Every failure — refused, unreachable, slow, nonsense reply — is null
 * on purpose: this is a suggestion, and the form has to save either way.
 *
 * Transliteration, not translation. يوسف is Yousef, not Joseph.
 */
export async function suggestCustomerName(name: string): Promise<string | null> {
  try {
    const result = await callTranslateService(
      { name, mode: 'transliterate' },
      // Console only. Nothing about a missing suggestion is worth a message
      // in the form, so this never reaches a screen.
      'the function returned no name',
      SUGGEST_TIMEOUT_MS,
    )

    if ('error' in result) {
      console.warn('No name suggestion for', name, '—', result.error)
      return null
    }
    return result.translation
  } catch (thrown) {
    console.warn('No name suggestion for', name, '—', thrown)
    return null
  }
}
