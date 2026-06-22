/**
 * Legacy / short institution names that are real schools but omit "School", "Primary", etc.
 * Owner-confirmed: NTATA = Ntataise Primary School.
 */
export const KNOWN_SCHOOL_ACCOUNT_KEYS = new Set<string>([
  "NTATA", // Ntataise Primary School
]);

/** Folder name dedupe key (lowercase, no level words) → account match keys. */
export const SCHOOL_FOLDER_TO_ACCOUNT_KEYS: Record<string, string[]> = {
  ntataise: ["NTATA"],
};

export function schoolAccountMatchKey(name: string | undefined | null): string {
  return String(name || "")
    .trim()
    .toUpperCase()
    .replace(/\b([A-Z])\s*\.\s*(?=[A-Z])/g, "$1")
    .replace(/[^A-Z0-9]/g, "");
}

export function isKnownSchoolAccountName(name: string | undefined | null): boolean {
  const key = schoolAccountMatchKey(name);
  return key.length > 0 && KNOWN_SCHOOL_ACCOUNT_KEYS.has(key);
}

export function folderAliasAccountKeys(folderLabel: string): string[] {
  const folded = String(folderLabel || "")
    .toLowerCase()
    .replace(/\bcommunity\b/g, "")
    .replace(/\bjunior\b/g, "")
    .replace(/\bsecondary\b/g, "")
    .replace(/\bhigh\b/g, "")
    .replace(/\bprimary\b/g, "")
    .replace(/\bpreparatory\b/g, "")
    .replace(/\bpre[- ]?primary\b/g, "")
    .replace(/\bschool\b/g, "")
    .replace(/\bcollege\b/g, "")
    .replace(/\bacademy\b/g, "")
    .replace(/\bnursery\b/g, "")
    .replace(/\binstitute\b/g, "")
    .replace(/\bmedium\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  const out = new Set<string>();
  const direct = SCHOOL_FOLDER_TO_ACCOUNT_KEYS[folded] || [];
  for (const k of direct) out.add(schoolAccountMatchKey(k));
  for (const [folderKey, accountKeys] of Object.entries(SCHOOL_FOLDER_TO_ACCOUNT_KEYS)) {
    if (folded.includes(folderKey) || folderKey.includes(folded)) {
      for (const k of accountKeys) out.add(schoolAccountMatchKey(k));
    }
  }
  return [...out];
}
