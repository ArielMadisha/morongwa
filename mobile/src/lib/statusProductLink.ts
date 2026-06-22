import type { StatusStripPost } from "./statusStripItem";
import type { TVPost } from "../types";

export function statusProductId(
  statusPost: StatusStripPost | undefined,
  loaded: TVPost | null
): string | null {
  if (statusPost?.type === "product") {
    const id = String(statusPost._id || "").trim();
    if (id && /^[a-f0-9]{24}$/i.test(id)) return id;
  }
  if (!loaded) return null;
  if (loaded.type === "product" && loaded.productId) {
    const raw = loaded.productId as string | { _id?: string };
    if (typeof raw === "object" && raw._id) return String(raw._id);
    if (typeof raw === "string") return raw;
  }
  if (loaded.type === "product" && loaded._id && /^[a-f0-9]{24}$/i.test(loaded._id)) {
    return loaded._id;
  }
  return null;
}
