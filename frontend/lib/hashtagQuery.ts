/** When wall `?q=` is a single hashtag (e.g. `#football`), return the normalized tag. */
export function parseHashtagFromQuery(q: string | null | undefined): string | undefined {
  const trimmed = (q ?? '').trim();
  if (!trimmed || trimmed.includes(' ')) return undefined;
  const bare = trimmed.replace(/^#/, '').trim();
  if (!bare || bare.length > 80) return undefined;
  if (!/^[A-Za-z0-9_][A-Za-z0-9_]*$/.test(bare)) return undefined;
  return bare.toLowerCase();
}

export function wallHashtagSearchUrl(tag: string): string {
  return `/wall?q=%23${encodeURIComponent(tag.replace(/^#/, '').trim().toLowerCase())}`;
}

export function wallStartTopicUrl(tag: string, loggedIn: boolean): string {
  const bare = tag.replace(/^#/, '').trim().toLowerCase();
  const path = `/wall?create=1&hashtag=${encodeURIComponent(bare)}&q=%23${encodeURIComponent(bare)}`;
  return loggedIn ? path : `/login?returnTo=${encodeURIComponent(path)}`;
}
