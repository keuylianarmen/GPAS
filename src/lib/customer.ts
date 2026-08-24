import type { Database } from '../types/database'
import { localised, t } from './i18n'

type Customer = Database['public']['Tables']['customers']['Row']

/**
 * The active language's name, falling back to the other when it is null, then
 * to a placeholder. Never blank because one side is missing.
 */
export function customerLabel(
  customer: Pick<Customer, 'name_en' | 'name_ar'>,
): string {
  return localised(customer.name_en, customer.name_ar) ?? t('customer.unnamed')
}

/** Phones are stored with spacing, so match on the digits too. */
export function matchesCustomerSearch(
  customer: Pick<Customer, 'name_en' | 'name_ar' | 'phone'>,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  const fields = [customer.name_en, customer.name_ar, customer.phone]
  if (fields.some((value) => value?.toLowerCase().includes(needle))) return true

  const digits = needle.replace(/\D/g, '')
  if (!digits) return false
  return (customer.phone ?? '').replace(/\D/g, '').includes(digits)
}
