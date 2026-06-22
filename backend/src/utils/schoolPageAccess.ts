import type { IUser } from "../data/models/User";

export const MAX_SCHOOL_PAGE_MANAGERS = 5;

export function schoolManagerIdStrings(school: Pick<IUser, "schoolPageManagers">): string[] {
  const raw = (school as any).schoolPageManagers as unknown[] | undefined;
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => (typeof m === "object" && m && "_id" in (m as object) ? String((m as { _id: unknown })._id) : String(m)));
}

/** The school account itself, or a listed page manager, may edit public page fields. */
export function canEditSchoolProfile(actorId: string, school: Pick<IUser, "_id" | "isSchoolAccount" | "schoolPageManagers">): boolean {
  const sid = String((school as any)._id);
  if (sid === String(actorId)) return true;
  if (!(school as any).isSchoolAccount) return false;
  return schoolManagerIdStrings(school as any).includes(String(actorId));
}

/** Owner or any manager may add/remove managers (Facebook-style co-admin). */
export function canManageSchoolManagers(actorId: string, school: Pick<IUser, "_id" | "isSchoolAccount" | "schoolPageManagers">): boolean {
  return canEditSchoolProfile(actorId, school);
}
