/**
 * Supplier service – returns adapter for CJ, Spocket, EPROLO
 */

import ExternalSupplier from "../../data/models/ExternalSupplier";
import { createCJAdapter } from "./cjAdapter";
import { createEproloAdapter } from "./eproloAdapter";
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
  } else if (source === "eprolo" && ext.apiSecret) {
    adapter = createEproloAdapter(ext.apiKey, ext.apiSecret, ext._id.toString());
  } else {
    return null; // Spocket not yet implemented
  }

  adapterCache.set(key, adapter);
  return adapter;
}

/** Get adapter by external supplier ID (for order forwarding) */
export async function getSupplierAdapterById(externalSupplierId: string): Promise<SupplierAdapter | null> {
  const ext = await ExternalSupplier.findById(externalSupplierId).lean();
  if (!ext?.apiKey) return null;
  const source = ext.source as "cj" | "spocket" | "eprolo";
  if (!["cj", "eprolo"].includes(source)) return null;
  if (source === "eprolo" && !ext.apiSecret) return null;
  return getSupplierAdapter(source);
}

export async function getCJAdapter(): Promise<SupplierAdapter | null> {
  return getSupplierAdapter("cj");
}

export async function getEproloAdapter(): Promise<SupplierAdapter | null> {
  return getSupplierAdapter("eprolo");
}
