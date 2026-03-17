/**
 * Supplier service – returns adapter for CJ, Spocket, EPROLO
 */

import ExternalSupplier from "../../data/models/ExternalSupplier";
import { createCJAdapter } from "./cjAdapter";
import type { SupplierAdapter } from "./types";

const adapterCache = new Map<string, SupplierAdapter>();

export async function getSupplierAdapter(source: "cj" | "spocket" | "eprolo"): Promise<SupplierAdapter | null> {
  const key = source;
  const cached = adapterCache.get(key);
  if (cached) return cached;

  const ext = await ExternalSupplier.findOne({ source, status: "active" }).lean();
  if (!ext?.apiKey) return null;

  let adapter: SupplierAdapter;
  if (source === "cj") {
    adapter = createCJAdapter(ext.apiKey, ext._id.toString());
  } else {
    return null; // Spocket, EPROLO adapters not yet implemented
  }

  adapterCache.set(key, adapter);
  return adapter;
}

export async function getCJAdapter(): Promise<SupplierAdapter | null> {
  return getSupplierAdapter("cj");
}
