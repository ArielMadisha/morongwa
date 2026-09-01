/** Derive a non-empty display title for TV / wall posts. Never returns "Untitled post". */
export function resolvePostDisplayTitle(post: {
  heading?: string | null;
  caption?: string | null;
  subject?: string | null;
  type?: string | null;
  creatorName?: string | null;
}): string {
  const heading = String(post.heading || "").trim();
  if (heading && !/^untitled(\s+post)?$/i.test(heading)) return heading;

  const caption = String(post.caption || "").trim();
  if (caption) {
    const firstLine = caption.split(/\n/)[0]?.trim() || caption;
    if (firstLine && !/^untitled(\s+post)?$/i.test(firstLine)) {
      return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
    }
  }

  const subject = String(post.subject || "").trim();
  if (subject && !/^untitled(\s+post)?$/i.test(subject)) return subject;

  const type = String(post.type || "").toLowerCase();
  if (type === "video") return "Video";
  if (type === "image" || type === "photo") return "Photo";
  if (type === "qwertz" || type === "music") return "Audio post";

  const creator = String(post.creatorName || "").trim();
  if (creator) return `${creator}'s post`;

  return "Post";
}
