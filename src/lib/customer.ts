import type { Database } from '../types/database'

type Customer = Database['public']['Tables']['customers']['Row']

/** Both name columns are nullable, so fall back through to a placeholder. */
export function customerLabel(
  customer: Pick<Customer, 'name_en' | 'name_ar'>,
): string {
  return customer.name_en || customer.name_ar || 'Unnamed'
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
