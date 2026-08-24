import { FunctionsHttpError } from '@supabase/functions-js'
import { supabase } from './supabase'
import { t } from './i18n'

export type TranslationResult =
  | { translation: string; direction: string | null }
  | { error: string }

/**
 * Asks the translate-service edge function for the other-language name.
 * `invoke` attaches the session token, which the function requires.
 *
 * The caller decides what to do with the suggestion — nothing here writes it
 * anywhere. These names reach customers in reminders, so a translation is
 * always something a person has seen and accepted.
 */
export async function translateServiceName(
  name: string,
  categoryId: number,
): Promise<TranslationResult> {
  const { data, error } = await supabase.functions.invoke('translate-service', {
    body: { name, categoryId },
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
    return { error: t('serviceForm.translateEmpty') }
  }

  const direction =
    'direction' in payload && typeof payload.direction === 'string'
      ? payload.direction
      : null

  return { translation: payload.translation.trim(), direction }
}
