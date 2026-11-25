// Pure helpers for the sign-in and claim screens (no Svelte, DOM, or network).

export const CODE_LENGTH = 6;

/** Trimmed, lower-cased email, or null if it doesn't look like one. */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * The digits of a typed or pasted code ("123 456", "123-456" → "123456"),
 * capped at the code length.
 */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export interface RosterEntry {
  id: string;
  name: string;
  team: string | null;
}

/** Lower-case, accents removed: "José" matches "jose". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Entries whose name or team contains every word of the query, in any order
 * ("ali mor", "moreno", "silver"). An empty query returns the whole list.
 */
export function searchRoster(entries: RosterEntry[], query: string): RosterEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((e) => {
    const hay = fold(`${e.name} ${e.team ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}
