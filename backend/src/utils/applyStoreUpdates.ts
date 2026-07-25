import mongoose from "mongoose";
import Store, { IStore } from "../data/models/Store";
import Supplier from "../data/models/Supplier";
import { normalizeWhatsappMarketCountries, resolveStoreCountry } from "../config/storeCountries";
import { slugify } from "./helpers";

export type StoreUpdateBody = {
  name?: string;
  country?: string;
  countryCode?: string;
  address?: string;
  email?: string;
  cellphone?: string;
  whatsapp?: string;
  stripBackgroundPic?: string;
  whatsappMarketCountries?: string[];
  mapsUrl?: string;
  latitude?: number | null;
  longitude?: number | null;
};

/** Apply owner/admin store field updates; returns whether name changed. */
export async function applyStoreUpdates(store: IStore, body: StoreUpdateBody): Promise<boolean> {
  let nameChanged = false;
  if (body.name != null && typeof body.name === "string" && body.name.trim()) {
    const trimmed = body.name.trim();
    if (store.name !== trimmed) {
      let slug = slugify(trimmed);
      let n = 1;
      while (await Store.findOne({ slug, _id: { $ne: store._id } })) {
        slug = `${slugify(trimmed)}-${++n}`;
      }
      store.name = trimmed;
      store.slug = slug;
      nameChanged = true;
    }
  }
  if (body.country !== undefined || body.countryCode !== undefined) {
    const resolved = resolveStoreCountry(
      String(body.countryCode || body.country || "").trim()
    );
    if (!resolved) {
      throw new Error("Invalid store country. Choose a country from the list.");
    }
    store.country = resolved.country;
    store.countryCode = resolved.countryCode;
  }
  if (body.address !== undefined) store.address = body.address?.trim() || undefined;
  if (body.mapsUrl !== undefined) store.mapsUrl = body.mapsUrl?.trim() || undefined;
  if (body.latitude !== undefined) {
    if (body.latitude === null || body.latitude === ("" as never)) {
      store.latitude = undefined;
    } else {
      const lat = Number(body.latitude);
      store.latitude = Number.isFinite(lat) ? lat : undefined;
    }
  }
  if (body.longitude !== undefined) {
    if (body.longitude === null || body.longitude === ("" as never)) {
      store.longitude = undefined;
    } else {
      const lng = Number(body.longitude);
      store.longitude = Number.isFinite(lng) ? lng : undefined;
    }
  }
  if (body.email !== undefined) store.email = body.email?.trim() || undefined;
  if (body.cellphone !== undefined) store.cellphone = body.cellphone?.trim() || undefined;
  if (body.whatsapp !== undefined) store.whatsapp = body.whatsapp?.trim() || undefined;
  if (body.stripBackgroundPic !== undefined) {
    store.stripBackgroundPic = body.stripBackgroundPic?.trim() || undefined;
  }
  if (body.whatsappMarketCountries !== undefined) {
    const normalized = normalizeWhatsappMarketCountries(
      body.whatsappMarketCountries,
      store.countryCode
    );
    store.whatsappMarketCountries = normalized.length ? normalized : undefined;
  }

  await store.save();

  if (nameChanged && store.type === "supplier" && store.supplierId) {
    await Supplier.updateOne(
      { _id: store.supplierId as mongoose.Types.ObjectId },
      { $set: { storeName: store.name } }
    );
  }

  return nameChanged;
}
