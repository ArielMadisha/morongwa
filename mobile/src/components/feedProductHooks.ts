import { useEffect, useState } from "react";
import { productsAPI } from "../lib/api";
import { Product } from "../types";

const productFetchCache = new Map<string, Promise<Product | null>>();

function getCachedProduct(productId: string): Promise<Product | null> {
  if (!productFetchCache.has(productId)) {
    productFetchCache.set(
      productId,
      productsAPI.getByIdOrSlug(productId).then((r) => r.data?.data ?? null)
    );
  }
  return productFetchCache.get(productId)!;
}

export function useCachedProduct(productId?: string) {
  const [product, setProduct] = useState<Product | null>(null);
  useEffect(() => {
    if (!productId) {
      setProduct(null);
      return;
    }
    let cancelled = false;
    void getCachedProduct(productId).then((p) => {
      if (!cancelled) setProduct(p);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);
  return product;
}
