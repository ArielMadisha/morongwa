export type TaggedUserRef = {
  _id?: string;
  name?: string;
  username?: string;
  avatar?: string;
};

export function taggedUserId(u: TaggedUserRef | string | null | undefined): string {
  if (!u) return '';
  if (typeof u === 'string') return u;
  return String(u._id || '');
}

export function taggedUserLabel(u: TaggedUserRef): string {
  return String(u.name || u.username || 'User').trim() || 'User';
}
