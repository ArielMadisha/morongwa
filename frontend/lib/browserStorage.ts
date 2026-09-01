/**
 * Some Android embedded WebViews / strict privacy modes expose `window.localStorage === null`
 * or throw on access. Never dereference storage without these guards.
 *
 * In-memory fallback keeps auth for the tab lifetime when setItem fails (Safari private /
 * ITP / quota) so a successful login is not silently dropped.
 */

const memoryLocal: Record<string, string> = {};

function getLocal(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const ls = window.localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

function getSession(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const ss = window.sessionStorage;
    return ss ?? null;
  } catch {
    return null;
  }
}

export function lsGetItem(key: string): string | null {
  const ls = getLocal();
  if (ls) {
    try {
      const v = ls.getItem(key);
      if (v != null) {
        memoryLocal[key] = v;
        return v;
      }
    } catch {
      /* fall through to memory */
    }
  }
  return Object.prototype.hasOwnProperty.call(memoryLocal, key) ? memoryLocal[key] : null;
}

export function lsSetItem(key: string, value: string): void {
  memoryLocal[key] = value;
  const ls = getLocal();
  if (!ls) return;
  try {
    ls.setItem(key, value);
  } catch {
    /* quota / private mode — memory still holds value for this tab */
  }
}

export function lsRemoveItem(key: string): void {
  delete memoryLocal[key];
  const ls = getLocal();
  if (!ls) return;
  try {
    ls.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function ssGetItem(key: string): string | null {
  const ss = getSession();
  if (!ss) return null;
  try {
    return ss.getItem(key);
  } catch {
    return null;
  }
}

export function ssSetItem(key: string, value: string): void {
  const ss = getSession();
  if (!ss) return;
  try {
    ss.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function ssRemoveItem(key: string): void {
  const ss = getSession();
  if (!ss) return;
  try {
    ss.removeItem(key);
  } catch {
    /* ignore */
  }
}
