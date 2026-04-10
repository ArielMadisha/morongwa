/**
 * Sync EPROLO product stock from EPROLO API
 * Used by sync script and admin API
 */

import Product from "../data/models/Product";
import { getEproloAdapter } from "./suppliers/supplierService";

export interface SyncResult {
  total: number;
  updated: number;
  failed: number;
  outOfStock: string[];
}

export async function syncEproloProductStock(): Promise<SyncResult> {
  const adapter = await getEproloAdapter();
  if (!adapter?.getStockByVid) {
    throw new Error("EPROLO adapter or getStockByVid not available");
  }

  const products = await Product.find({ supplierSource: "eprolo", active: true }).lean();
  const result: SyncResult = { total: products.length, updated: 0, failed: 0, outOfStock: [] };

  for (const p of products) {
    const ext = (p as any).externalData;
    const vid = ext?.variants?.[0]?.vid ?? ext?.variants?.[0]?.id;
    if (!vid) {
      result.failed++;
      continue;
    }

    try {
      const stock = await adapter.getStockByVid(vid);
      if (stock === null) {
        result.failed++;
        continue;
      }

      const outOfStock = stock < 1;
      await Product.updateOne({ _id: p._id }, { $set: { stock, outOfStock } });
      result.updated++;
      if (outOfStock) {
        result.outOfStock.push((p as any).title || (p as any)._id?.toString());
      }
    } catch {
      result.failed++;
    }
  }

  return result;
}
