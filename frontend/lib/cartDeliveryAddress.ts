/** Persist marketplace delivery details from cart → checkout (one address entry). */

export type CartDeliveryAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal: string;
  country: string;
};

export const CART_DELIVERY_STORAGE_KEY = 'qwertymates.cart.deliveryAddress';
export const CART_DELIVERY_CITY_KEY = 'qwertymates.cart.deliveryCity';

export function buildDeliveryAddressText(fields: CartDeliveryAddress): string {
  return [
    fields.line1.trim(),
    fields.line2.trim(),
    fields.city.trim(),
    fields.state.trim(),
    fields.postal.trim(),
    fields.country.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function isFullDeliveryAddressComplete(fields: Partial<CartDeliveryAddress> | null | undefined): boolean {
  if (!fields) return false;
  return Boolean(String(fields.line1 || '').trim() && String(fields.city || '').trim() && String(fields.country || '').trim());
}

export function readCartDeliveryAddress(): CartDeliveryAddress | null {
  try {
    const raw = sessionStorage.getItem(CART_DELIVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartDeliveryAddress;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      line1: String(parsed.line1 || ''),
      line2: String(parsed.line2 || ''),
      city: String(parsed.city || ''),
      state: String(parsed.state || ''),
      postal: String(parsed.postal || ''),
      country: String(parsed.country || 'ZA'),
    };
  } catch {
    return null;
  }
}

export function writeCartDeliveryAddress(fields: CartDeliveryAddress): void {
  try {
    sessionStorage.setItem(CART_DELIVERY_STORAGE_KEY, JSON.stringify(fields));
    const city = fields.city.trim();
    if (city) sessionStorage.setItem(CART_DELIVERY_CITY_KEY, city);
    else sessionStorage.removeItem(CART_DELIVERY_CITY_KEY);
  } catch {
    /* ignore */
  }
}
