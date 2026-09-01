import Supplier from "../data/models/Supplier";
import Store from "../data/models/Store";
import { isNumericOnlyLabel, publicUsernameHandle } from "./userDisplayLabel";
import { inferIsSchoolAccountForPublicProfile } from "./schoolProfileDetection";

export type PublicProfileKind = "individual" | "school" | "business";

type UserContactRow = {
  _id?: unknown;
  phone?: string | null;
  email?: string | null;
  username?: string | null;
  showPhonePublicly?: boolean | null;
  schoolPublicEmail?: string | null;
  isSchoolAccount?: boolean | null;
  name?: string | null;
};

export async function resolvePublicProfileKind(
  userId: string,
  user: Pick<UserContactRow, "isSchoolAccount" | "name">
): Promise<PublicProfileKind> {
  if (inferIsSchoolAccountForPublicProfile(user as { isSchoolAccount?: boolean; name?: string })) return "school";
  const [companySupplier, supplierStore] = await Promise.all([
    Supplier.findOne({ userId, status: "approved", type: "company" }).select("_id").lean(),
    Store.findOne({ userId, type: "supplier" }).select("_id").lean(),
  ]);
  if (companySupplier || supplierStore) return "business";
  return "individual";
}

function resolvePublicPhone(user: UserContactRow): string | null {
  const phone = String(user.phone || "").trim();
  if (phone) return phone;
  const username = String(user.username || "").trim();
  if (username && isNumericOnlyLabel(username)) return username;
  return null;
}

/** Strip or expose phone/email on user payloads for profile viewers. */
export function applyPublicContactPrivacy(
  payload: Record<string, unknown>,
  opts: {
    viewerId?: string | null;
    ownerId: string;
    profileKind: PublicProfileKind;
  }
): Record<string, unknown> {
  const isSelf = !!opts.viewerId && opts.viewerId === opts.ownerId;
  const user = payload as UserContactRow;
  const out: Record<string, unknown> = { ...payload };

  // Registration IP/geo is admin-intel only (see GET /admin/registration-intel).
  delete out.registrationIp;
  delete out.registrationGeo;

  if (isSelf) {
    out.publicProfileKind = opts.profileKind;
    return out;
  }

  out.publicProfileKind = opts.profileKind;
  delete out.email;

  if (opts.profileKind === "school") {
    out.publicContactPhone = resolvePublicPhone(user);
    return applyPublicUsernamePrivacy(out, opts);
  }

  if (opts.profileKind === "business") {
    out.publicContactPhone = resolvePublicPhone(user);
    return applyPublicUsernamePrivacy(out, opts);
  }

  delete out.showPhonePublicly;
  if (user.showPhonePublicly === true) {
    out.publicContactPhone = resolvePublicPhone(user);
  } else {
    out.publicContactPhone = null;
  }
  delete out.phone;
  return applyPublicUsernamePrivacy(out, opts);
}

/** Replace phone-number usernames in API payloads for private individuals (not self). */
export function applyPublicUsernamePrivacy(
  payload: Record<string, unknown>,
  opts: {
    viewerId?: string | null;
    ownerId: string;
    profileKind: PublicProfileKind;
  }
): Record<string, unknown> {
  const isSelf = !!opts.viewerId && opts.viewerId === opts.ownerId;
  if (isSelf) return payload;

  const user = payload as UserContactRow;
  const masked = publicUsernameHandle(
    { ...user, publicProfileKind: opts.profileKind },
    opts.profileKind
  );
  if (!masked) return payload;

  return { ...payload, username: masked, publicProfileKind: opts.profileKind };
}

type UserKindRow = Pick<UserContactRow, "isSchoolAccount" | "name"> & { _id?: unknown };

/** Resolve school / business / individual for a batch of users (list endpoints). */
export async function batchResolvePublicProfileKinds(
  users: UserKindRow[]
): Promise<Map<string, PublicProfileKind>> {
  const map = new Map<string, PublicProfileKind>();
  const needsBusinessCheck: string[] = [];

  for (const u of users) {
    const id = String(u._id ?? "");
    if (!id) continue;
    if (inferIsSchoolAccountForPublicProfile(u as { isSchoolAccount?: boolean; name?: string })) {
      map.set(id, "school");
    } else {
      needsBusinessCheck.push(id);
    }
  }

  if (needsBusinessCheck.length) {
    const [suppliers, stores] = await Promise.all([
      Supplier.find({
        userId: { $in: needsBusinessCheck },
        status: "approved",
        type: "company",
      })
        .select("userId")
        .lean(),
      Store.find({ userId: { $in: needsBusinessCheck }, type: "supplier" })
        .select("userId")
        .lean(),
    ]);
    const businessIds = new Set([
      ...suppliers.map((s) => String(s.userId)),
      ...stores.map((s) => String(s.userId)),
    ]);
    for (const id of needsBusinessCheck) {
      map.set(id, businessIds.has(id) ? "business" : "individual");
    }
  }

  return map;
}

/** Mask phone usernames on user list payloads for non-self viewers. */
export async function sanitizeUsersForClientView(
  users: Record<string, unknown>[],
  viewerId?: string | null
): Promise<Record<string, unknown>[]> {
  if (!users.length) return [];
  const kindMap = await batchResolvePublicProfileKinds(users as UserKindRow[]);
  return users.map((raw) => {
    const ownerId = String(raw._id ?? "");
    const profileKind = kindMap.get(ownerId) ?? "individual";
    return applyPublicUsernamePrivacy(raw, { viewerId, ownerId, profileKind });
  });
}
