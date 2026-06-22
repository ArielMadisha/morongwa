import phones from './bwPrimarySchoolPhones.json';

const dict = phones as Record<string, string>;

function normalizeKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[’']/g, "'")
    .replace(/\s*-\s*/g, '-')
    .replace(/[^a-z0-9\s'-]/g, '')
    .trim();
}

/**
 * Local digits (no country code) from the PUBLIC PRIMARY SCHOOLS PDF telephone column, if the
 * display name matches a row in the generated lookup.
 */
export function getBwPrimarySchoolLocalPhone(displayName: string): string | null {
  const n = normalizeKey(displayName);
  if (!n) return null;
  if (dict[n]) return dict[n];

  const stripped = n
    .replace(/\b(primary school|pr school|public school|p s|ps)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped && dict[stripped]) return dict[stripped];

  const tokens = n.split(/\s+/).filter(Boolean);
  const maxPhrase = Math.min(8, tokens.length);
  for (let len = maxPhrase; len >= 1; len--) {
    const phrase = tokens.slice(0, len).join(' ');
    if (dict[phrase]) return dict[phrase];
  }
  for (let len = maxPhrase; len >= 1; len--) {
    const phrase = tokens.slice(-len).join(' ');
    if (dict[phrase]) return dict[phrase];
  }
  return null;
}
