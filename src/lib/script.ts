/**
 * Which column a typed name belongs in. Any Arabic letter makes it Arabic — a
 * service name is not going to be half and half, and Latin digits or
 * punctuation inside an Arabic name must not tip the decision.
 *
 * A Unicode script property rather than a hand-written range: the Arabic
 * blocks are five separate ranges, and writing them out literally pulls in
 * codepoints like the byte-order mark that have no business here.
 */
export function isArabicScript(text: string): boolean {
  return /\p{Script=Arabic}/u.test(text)
}
