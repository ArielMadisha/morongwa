/**
 * Lightweight bridge so push / alerts can open the Errands hub from AuthContext
 * without importing HomeScreen.
 */

export type ErrandsOpenRequest = {
  tab?: "orders" | "clients" | "runners";
};

type OpenListener = (req: ErrandsOpenRequest) => void;
type NewOrderListener = () => void;

const openListeners = new Set<OpenListener>();
const newOrderListeners = new Set<NewOrderListener>();

export function subscribeOpenErrands(listener: OpenListener): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

export function requestOpenErrands(req: ErrandsOpenRequest = {}): void {
  openListeners.forEach((fn) => {
    try {
      fn(req);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeNewShopOrderAlert(listener: NewOrderListener): () => void {
  newOrderListeners.add(listener);
  return () => {
    newOrderListeners.delete(listener);
  };
}

/** Fired when a foreground shop-order push arrives (or poll detects a new unread). */
export function emitNewShopOrderAlert(): void {
  newOrderListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
