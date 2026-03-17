/**
 * Courier rules seed – Southern Africa + EU
 * Run: npx ts-node -r tsconfig-paths/register src/data/seeds/courierRules.ts
 * Or call seedCourierRules() from a script after DB connect
 */

import CourierRule from "../models/CourierRule";

export const COURIER_RULES_SEED = [
  { country: "ZA", region: "Southern Africa", preferredSupplier: "spocket", courier: "Aramex", shippingMethod: "Local Express", deliveryDays: 5 },
  { country: "ZM", region: "Southern Africa", preferredSupplier: "cj", courier: "DHL", shippingMethod: "CJPacket", deliveryDays: 10 },
  { country: "BW", region: "Southern Africa", preferredSupplier: "cj", courier: "DHL", shippingMethod: "CJPacket", deliveryDays: 9 },
  { country: "NA", region: "Southern Africa", preferredSupplier: "cj", courier: "Yanwen", shippingMethod: "Standard", deliveryDays: 8 },
  { country: "LS", region: "Southern Africa", preferredSupplier: "spocket", courier: "The Courier Guy", shippingMethod: "Local Express", deliveryDays: 3 },
  { country: "ZW", region: "Southern Africa", preferredSupplier: "cj", courier: "DHL", shippingMethod: "CJPacket", deliveryDays: 12 },
  { country: "MZ", region: "Southern Africa", preferredSupplier: "cj", courier: "DHL", shippingMethod: "CJPacket", deliveryDays: 11 },
  { country: "DE", region: "EU", preferredSupplier: "spocket", courier: "DHL Express", shippingMethod: "EU Warehouse", deliveryDays: 3 },
  { country: "FR", region: "EU", preferredSupplier: "spocket", courier: "La Poste", shippingMethod: "EU Warehouse", deliveryDays: 3 },
  { country: "IT", region: "EU", preferredSupplier: "eprolo", courier: "DHL Express", shippingMethod: "EU Warehouse", deliveryDays: 4 },
  { country: "ES", region: "EU", preferredSupplier: "spocket", courier: "Correos", shippingMethod: "EU Warehouse", deliveryDays: 3 },
  { country: "NL", region: "EU", preferredSupplier: "spocket", courier: "PostNL", shippingMethod: "EU Warehouse", deliveryDays: 3 },
  { country: "BE", region: "EU", preferredSupplier: "spocket", courier: "bpost", shippingMethod: "EU Warehouse", deliveryDays: 3 },
  { country: "AT", region: "EU", preferredSupplier: "spocket", courier: "Austrian Post", shippingMethod: "EU Warehouse", deliveryDays: 4 },
  { country: "PL", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "EU Warehouse", deliveryDays: 5 },
  { country: "PT", region: "EU", preferredSupplier: "spocket", courier: "CTT", shippingMethod: "EU Warehouse", deliveryDays: 4 },
  { country: "SE", region: "EU", preferredSupplier: "spocket", courier: "PostNord", shippingMethod: "EU Warehouse", deliveryDays: 4 },
  { country: "IE", region: "EU", preferredSupplier: "spocket", courier: "An Post", shippingMethod: "EU Warehouse", deliveryDays: 4 },
  { country: "GR", region: "EU", preferredSupplier: "cj", courier: "ACS", shippingMethod: "Standard", deliveryDays: 6 },
  { country: "RO", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "Standard", deliveryDays: 7 },
  { country: "CZ", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "EU Warehouse", deliveryDays: 5 },
  { country: "HU", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "Standard", deliveryDays: 6 },
  { country: "BG", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "Standard", deliveryDays: 7 },
  { country: "HR", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "Standard", deliveryDays: 6 },
  { country: "SK", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "EU Warehouse", deliveryDays: 5 },
  { country: "SI", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "EU Warehouse", deliveryDays: 5 },
  { country: "DK", region: "EU", preferredSupplier: "spocket", courier: "PostNord", shippingMethod: "EU Warehouse", deliveryDays: 4 },
  { country: "FI", region: "EU", preferredSupplier: "spocket", courier: "Posti", shippingMethod: "EU Warehouse", deliveryDays: 5 },
  { country: "EE", region: "EU", preferredSupplier: "cj", courier: "Omniva", shippingMethod: "Standard", deliveryDays: 6 },
  { country: "LV", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "Standard", deliveryDays: 6 },
  { country: "LT", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "Standard", deliveryDays: 6 },
  { country: "CY", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "Standard", deliveryDays: 7 },
  { country: "MT", region: "EU", preferredSupplier: "cj", courier: "DHL", shippingMethod: "Standard", deliveryDays: 7 },
  { country: "LU", region: "EU", preferredSupplier: "spocket", courier: "La Poste", shippingMethod: "EU Warehouse", deliveryDays: 3 },
];

export async function seedCourierRules(): Promise<number> {
  let count = 0;
  for (const rule of COURIER_RULES_SEED) {
    await CourierRule.findOneAndUpdate(
      { country: rule.country },
      { $set: { ...rule, active: true } },
      { upsert: true, new: true }
    );
    count++;
  }
  return count;
}
