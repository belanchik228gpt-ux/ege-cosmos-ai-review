const normalize = (value: string) =>
  value
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** All entered words must occur; punctuation and word order do not block a known title. */
export function matchesSearchText(value: string, query: string): boolean {
  const haystack = normalize(value);
  return normalize(query)
    .split(/\s+/u)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
