import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken
} from "react-native";
import { cartAPI, productsAPI, resellerAPI, toAbsoluteMediaUrl } from "../lib/api";
import { currencyForCountry, detectCountryCode, formatMoney } from "../lib/geoCurrency";
import { normalizeProductSizes } from "../lib/productSizes";
import { appTypography, socialTheme } from "../theme/socialTheme";
import { Product, ProductColorOption, ProductSupplierRef } from "../types";
import { HubCartStepper } from "../components/HubCartStepper";
import { useScrollAwareScrollHandlers } from "../components/ScrollAwareChrome";
import { Ionicons } from "@expo/vector-icons";

type HubScreenProps = {
  onAddedToCart?: () => void;
  onGoToCart?: () => void;
  openProductId?: string | null;
  onConsumedOpenProductId?: () => void;
  /** Full viewport height from HomeScreen feed area (for TikTok-style paging). */
  viewportHeight?: number;
  /** Currently focused product (for HomeScreen cart FAB under profile). */
  onFocusedProductChange?: (product: Product | null) => void;
};

type HubSection = "hub" | "food" | "groceries";

/** Catalog row with store enrichment from products API (food / groceries). */
type HubCatalogProduct = Product & {
  tags?: string[];
  store?: {
    _id?: string;
    name?: string;
    slug?: string;
    address?: string;
    mapsUrl?: string;
  };
};

type StoreCard = {
  key: string;
  name: string;
  storeId?: string;
  supplierId?: string;
  sampleImage?: string;
  menuCount: number;
  address?: string;
};

const PAGE_SIZE = 12;
const STORE_SECTION_LIMIT = 300;
const FOOD_CATEGORY = "Food & Restaurant";
const GROCERIES_CATEGORY = "Groceries";
/** Mirrors backend FOOD_ORDER_SERVICE_FEE_ZAR — baked into displayed food menu prices. */
const FOOD_ORDER_SERVICE_FEE_ZAR = 3.5;

/** Reverse-geocoded fallbacks (match web food marketplace). */
const FALLBACK_ADDRESS: Record<string, string> = {
  "caliba's township burger": "Mosimegi Street, Temba, Pretoria, Gauteng, 0407",
  calibastownshipburger: "Mosimegi Street, Temba, Pretoria, Gauteng, 0407"
};

function catalogUnitPrice(p: { price: number; discountPrice?: number }): number {
  if (
    typeof p.discountPrice === "number" &&
    p.discountPrice >= 0 &&
    p.discountPrice < p.price
  ) {
    return p.discountPrice;
  }
  return p.price;
}

function isFoodExtra(p: { tags?: string[] }): boolean {
  return (p.tags || []).map((t) => String(t).toLowerCase()).includes("food-extra");
}

function isFoodMenu(p: { tags?: string[]; categories?: string[] }): boolean {
  if (isFoodExtra(p)) return false;
  const tags = (p.tags || []).map((t) => String(t).toLowerCase());
  if (tags.includes("food-menu")) return true;
  return (p.categories || []).some(
    (c) => String(c).trim().toLowerCase() === FOOD_CATEGORY.toLowerCase()
  );
}

/**
 * Display price for food store menu = catalog + R3.50 service fee (same as checkout line).
 * Groceries / hub products: catalog only (no food service fee).
 */
function displayStoreUnitPrice(
  p: { price: number; discountPrice?: number; tags?: string[]; categories?: string[] },
  section: HubSection
): number {
  const base = catalogUnitPrice(p);
  if (section !== "food") return base;
  if (!isFoodMenu(p) && !isFoodExtra(p)) {
    // Other food pickup lines still attract the fee (matches backend).
    const cats = p.categories || [];
    const isFood = cats.some((c) => String(c).trim().toLowerCase() === FOOD_CATEGORY.toLowerCase());
    if (!isFood) return base;
  }
  // Standalone extras in the menu list also include fee; extras-with-menu waived at checkout only.
  return Math.round((base + FOOD_ORDER_SERVICE_FEE_ZAR) * 100) / 100;
}

function resolveSupplierId(p: HubCatalogProduct): string {
  const s = p.supplierId;
  if (!s) return "";
  if (typeof s === "string") return s;
  return String((s as ProductSupplierRef)._id || "");
}

function resolveStoreName(p: HubCatalogProduct): string {
  if (p.store?.name) return p.store.name;
  if (p.storeName) return p.storeName;
  const s = p.supplierId;
  if (s && typeof s === "object" && s.storeName) return s.storeName;
  return "Store";
}

function looksLikeCoordsOnly(address: string): boolean {
  const a = address.trim().toLowerCase();
  if (!a) return true;
  if (a.includes("customer collection") && /[°']/.test(a)) return true;
  if (/^\d{1,3}°/.test(a) || /\d{1,3}°\d{1,2}'/.test(a)) return true;
  return false;
}

function resolveAddress(p: HubCatalogProduct, name: string): string | undefined {
  const raw = (p.store?.address || "").trim();
  if (raw && !looksLikeCoordsOnly(raw)) return raw;
  const key = name.trim().toLowerCase();
  const fallback = FALLBACK_ADDRESS[key];
  if (fallback) return fallback;
  if (raw) return raw;
  const storeName = (p.storeName || "").trim();
  return storeName || undefined;
}

function storeKeyOf(p: HubCatalogProduct): string {
  const supplierId = resolveSupplierId(p);
  const storeId = p.store?._id ? String(p.store._id) : undefined;
  return storeId || supplierId || resolveStoreName(p);
}

function groupIntoStoreCards(products: HubCatalogProduct[]): StoreCard[] {
  const map = new Map<string, StoreCard>();
  for (const p of products) {
    const tags = (p.tags || []).map((t) => String(t).toLowerCase());
    if (tags.includes("food-extra")) continue;
    const supplierId = resolveSupplierId(p);
    const storeId = p.store?._id ? String(p.store._id) : undefined;
    const key = storeId || supplierId || resolveStoreName(p);
    if (!key) continue;
    const name = resolveStoreName(p);
    const existing = map.get(key);
    if (existing) {
      existing.menuCount += 1;
      if (!existing.address) existing.address = resolveAddress(p, name);
      if (!existing.sampleImage && p.images?.[0]) existing.sampleImage = p.images[0];
      continue;
    }
    map.set(key, {
      key,
      name,
      storeId,
      supplierId: supplierId || undefined,
      sampleImage: p.images?.[0],
      menuCount: 1,
      address: resolveAddress(p, name)
    });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function categoryForSection(section: HubSection): string | undefined {
  if (section === "food") return FOOD_CATEGORY;
  if (section === "groceries") return GROCERIES_CATEGORY;
  return undefined;
}

function isStoreBrowseSection(section: HubSection): boolean {
  return section === "food" || section === "groceries";
}

export function HubScreen({
  onAddedToCart,
  onGoToCart,
  openProductId,
  onConsumedOpenProductId,
  viewportHeight = 0,
  onFocusedProductChange
}: HubScreenProps) {
  // Only the store/menu lists collapse chrome; the full-page product pager keeps it.
  const chromeScroll = useScrollAwareScrollHandlers();
  const deviceCurrency = currencyForCountry(detectCountryCode());
  const { height: winH } = useWindowDimensions();
  const pageH = useMemo(() => {
    if (viewportHeight > 200) return viewportHeight;
    return Math.max(420, Math.round(winH * 0.72));
  }, [viewportHeight, winH]);

  const [section, setSection] = useState<HubSection>("hub");
  const [products, setProducts] = useState<HubCatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStoreKey, setSelectedStoreKey] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [addQty, setAddQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<ProductColorOption | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [resellingId, setResellingId] = useState<string | null>(null);
  const [cartQtyByProduct, setCartQtyByProduct] = useState<Record<string, number>>({});
  const focusedIdRef = useRef<string | null>(null);

  const productSizes = useMemo(
    () => normalizeProductSizes(Array.isArray(selectedProduct?.sizes) ? selectedProduct!.sizes : []),
    [selectedProduct]
  );

  const productColors = useMemo(() => {
    const raw = selectedProduct?.colors;
    if (!Array.isArray(raw)) return [];
    // Mirror web: require a name; fall back hex when missing so options still show.
    return raw
      .filter((c): c is ProductColorOption => Boolean(c?.name && String(c.name).trim()))
      .map((c) => ({
        ...c,
        name: String(c.name).trim(),
        hex: String(c.hex || "").trim() || "#cbd5e1",
        imageIndex: typeof c.imageIndex === "number" ? c.imageIndex : 0
      }));
  }, [selectedProduct]);

  const resetDetailVariants = useCallback(() => {
    setSelectedSize(null);
    setSelectedColor(null);
    setSelectedImageIndex(0);
  }, []);

  const changeSection = useCallback((next: HubSection) => {
    setSelectedStoreKey(null);
    setSection(next);
  }, []);

  const refreshCartQtys = useCallback(async () => {
    try {
      const res = await cartAPI.get();
      const items = res.data?.data?.items;
      const map: Record<string, number> = {};
      if (Array.isArray(items)) {
        for (const row of items) {
          const id = String(row.productId || (row.product as Product | undefined)?._id || "");
          if (id) map[id] = (map[id] || 0) + Number(row.qty || 0);
        }
      }
      setCartQtyByProduct(map);
    } catch {
      /* keep previous */
    }
  }, []);

  const loadProducts = useCallback(
    async (nextPage: number, append: boolean, activeSection: HubSection = section) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const storeBrowse = isStoreBrowseSection(activeSection);
        const res = await productsAPI.list({
          limit: storeBrowse ? STORE_SECTION_LIMIT : PAGE_SIZE,
          page: storeBrowse ? 1 : nextPage,
          category: categoryForSection(activeSection)
        });
        const next = res.data?.data;
        const list = (Array.isArray(next) ? next : []) as HubCatalogProduct[];
        if (storeBrowse) {
          setHasMore(false);
          setPage(1);
          setProducts(list);
        } else {
          const more =
            typeof res.data?.hasMore === "boolean" ? res.data.hasMore : list.length >= PAGE_SIZE;
          setHasMore(more);
          setPage(nextPage);
          setProducts((prev) => (append ? [...prev, ...list] : list));
        }
      } catch {
        if (!append) setProducts([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [section]
  );

  useEffect(() => {
    void loadProducts(1, false, section);
    void refreshCartQtys();
  }, [loadProducts, refreshCartQtys, section]);

  useEffect(() => {
    if (section !== "hub") {
      focusedIdRef.current = null;
      onFocusedProductChange?.(null);
    }
  }, [section, onFocusedProductChange]);

  const storeCards = useMemo(
    () => (isStoreBrowseSection(section) ? groupIntoStoreCards(products) : []),
    [products, section]
  );

  const selectedStore = useMemo(
    () => storeCards.find((s) => s.key === selectedStoreKey) || null,
    [storeCards, selectedStoreKey]
  );

  const menuProducts = useMemo(() => {
    if (!selectedStoreKey) return [];
    return products.filter((p) => storeKeyOf(p) === selectedStoreKey);
  }, [products, selectedStoreKey]);

  const loadMore = () => {
    if (isStoreBrowseSection(section) || loading || loadingMore || !hasMore) return;
    void loadProducts(page + 1, true, section);
  };

  const resellProduct = async (product: Product) => {
    if (!product?._id || resellingId) return;
    setResellingId(product._id);
    try {
      await resellerAPI.addProductToWall(product._id);
      Alert.alert("Resell", "Product added to your reseller wall.");
      onAddedToCart?.();
    } catch (err: any) {
      Alert.alert(
        "Resell",
        err?.response?.data?.error || err?.response?.data?.message || "Could not add to your wall."
      );
    } finally {
      setResellingId(null);
    }
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems.find((v) => v.isViewable) || viewableItems[0];
      const item = first?.item as Product | undefined;
      const id = item?._id ? String(item._id) : null;
      if (id === focusedIdRef.current) return;
      focusedIdRef.current = id;
      onFocusedProductChange?.(item || null);
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60
  }).current;

  useEffect(() => {
    if (section !== "hub") return;
    if (products[0] && !focusedIdRef.current) {
      focusedIdRef.current = String(products[0]._id);
      onFocusedProductChange?.(products[0]);
    }
  }, [products, onFocusedProductChange, section]);

  useEffect(() => {
    return () => onFocusedProductChange?.(null);
  }, [onFocusedProductChange]);

  const openProduct = async (id: string) => {
    setDetailsLoading(true);
    setDetailError("");
    setAddQty(1);
    resetDetailVariants();
    setSelectedProduct(null);
    try {
      const res = await productsAPI.getByIdOrSlug(id);
      const p = res.data?.data;
      if (p?._id) setSelectedProduct(p);
      else setDetailError("Product not found.");
    } catch {
      setDetailError("Could not load product details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (!openProductId?.trim()) return;
    let cancelled = false;
    const id = openProductId.trim();
    void (async () => {
      setDetailsLoading(true);
      setDetailError("");
      setAddQty(1);
      resetDetailVariants();
      setSelectedProduct(null);
      try {
        const res = await productsAPI.getByIdOrSlug(id);
        const p = res.data?.data;
        if (cancelled) return;
        if (p?._id) setSelectedProduct(p);
        else setDetailError("Product not found.");
      } catch {
        if (!cancelled) setDetailError("Could not load product details.");
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
      if (!cancelled) onConsumedOpenProductId?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [openProductId, onConsumedOpenProductId, resetDetailVariants]);

  // Mirror web ProductPageClient: default to first size/color when product opens.
  useEffect(() => {
    if (!selectedProduct?._id) return;
    const sizes = normalizeProductSizes(
      Array.isArray(selectedProduct.sizes) ? selectedProduct.sizes : []
    );
    const colors = Array.isArray(selectedProduct.colors)
      ? selectedProduct.colors
          .filter((c): c is ProductColorOption => Boolean(c?.name && String(c.name).trim()))
          .map((c) => ({
            ...c,
            name: String(c.name).trim(),
            hex: String(c.hex || "").trim() || "#cbd5e1",
            imageIndex: typeof c.imageIndex === "number" ? c.imageIndex : 0
          }))
      : [];
    if (sizes.length > 0) setSelectedSize(sizes[0]);
    else setSelectedSize(null);
    if (colors.length > 0) {
      setSelectedColor(colors[0]);
      const idx = colors[0].imageIndex;
      setSelectedImageIndex(typeof idx === "number" && idx >= 0 ? idx : 0);
    } else {
      setSelectedColor(null);
      setSelectedImageIndex(0);
    }
  }, [selectedProduct?._id]);

  const detailImageUri = useMemo(() => {
    const images = selectedProduct?.images || [];
    const raw = images[selectedImageIndex] || images[0];
    return toAbsoluteMediaUrl(raw);
  }, [selectedProduct, selectedImageIndex]);

  const addToCart = async () => {
    if (!selectedProduct?._id || adding || addQty < 1) return;
    if (productSizes.length > 0 && !String(selectedSize || "").trim()) {
      setDetailError("Please select a size.");
      return;
    }
    if (productColors.length > 0 && !String(selectedColor?.name || "").trim()) {
      setDetailError("Please select a color.");
      return;
    }
    setAdding(true);
    setDetailError("");
    try {
      await cartAPI.add(
        selectedProduct._id,
        addQty,
        undefined,
        selectedColor?.name,
        selectedSize || undefined
      );
      onAddedToCart?.();
      setSelectedProduct(null);
      resetDetailVariants();
    } catch (err: any) {
      setDetailError(err?.response?.data?.error || err?.response?.data?.message || "Failed to add to cart.");
    } finally {
      setAdding(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void loadProducts(1, false, section);
    void refreshCartQtys();
  };

  const renderHubProductPage = ({ item }: { item: HubCatalogProduct }) => {
    const imageUrl = toAbsoluteMediaUrl(item.images?.[0]);
    const title = String(item.title || "").trim() || "Product";
    const effectivePrice =
      typeof item.discountPrice === "number" &&
      item.discountPrice >= 0 &&
      item.discountPrice < item.price
        ? item.discountPrice
        : item.price;
    const allowResell = item.allowResell !== false;
    const outOfStock =
      item.outOfStock === true || (typeof item.stock === "number" && item.stock < 1);
    const qty = cartQtyByProduct[item._id] || 0;
    return (
      <View style={[styles.page, { height: pageH }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => void openProduct(item._id)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.productImage} />
          ) : (
            <View style={[styles.productImage, styles.imageFallback]} />
          )}
        </Pressable>
        <View style={styles.scrim} pointerEvents="none" />

        {allowResell ? (
          <Pressable
            onPress={() => void resellProduct(item)}
            disabled={resellingId === item._id}
            style={styles.resellTop}
            accessibilityRole="button"
            accessibilityLabel="Resell this product"
          >
            <Text style={styles.resellBadgeText}>{resellingId === item._id ? "…" : "RESELL"}</Text>
          </Pressable>
        ) : null}

        <HubCartStepper
          productId={item._id}
          qty={qty}
          outOfStock={outOfStock}
          onOpenCart={onGoToCart}
          onUpdated={(nextQty) => {
            setCartQtyByProduct((m) => ({ ...m, [item._id]: nextQty }));
            onAddedToCart?.();
          }}
        />

        <Pressable style={styles.bottomMeta} onPress={() => void openProduct(item._id)}>
          <Text style={styles.productTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.productPrice}>
            {formatMoney(effectivePrice, item.currency || deviceCurrency)}
          </Text>
          {typeof item.stock === "number" ? (
            <Text style={styles.productStock}>
              {item.stock > 0 ? `Stock ${item.stock}` : "Out of stock"}
            </Text>
          ) : null}
          {item.description ? (
            <Text style={styles.productDesc} numberOfLines={3}>
              {item.description}
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  };

  const renderMenuProduct = ({ item }: { item: HubCatalogProduct }) => {
    const imageUrl = toAbsoluteMediaUrl(item.images?.[0]);
    const title = String(item.title || "").trim() || "Product";
    const effectivePrice = displayStoreUnitPrice(item, section);
    const outOfStock =
      item.outOfStock === true || (typeof item.stock === "number" && item.stock < 1);
    const qty = cartQtyByProduct[item._id] || 0;
    return (
      <View style={styles.menuCard}>
        <Pressable
          style={styles.menuCardMedia}
          onPress={() => void openProduct(item._id)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.menuCardImage} />
          ) : (
            <View style={[styles.menuCardImage, styles.imageFallback]} />
          )}
          <HubCartStepper
            productId={item._id}
            qty={qty}
            outOfStock={outOfStock}
            onOpenCart={onGoToCart}
            onUpdated={(nextQty) => {
              setCartQtyByProduct((m) => ({ ...m, [item._id]: nextQty }));
              onAddedToCart?.();
            }}
          />
        </Pressable>
        <Pressable style={styles.menuCardBody} onPress={() => void openProduct(item._id)}>
          <Text style={styles.menuCardTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.menuCardPrice}>
            {formatMoney(effectivePrice, item.currency || deviceCurrency)}
          </Text>
          {item.description ? (
            <Text style={styles.menuCardDesc} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  };

  const renderStoreCard = ({ item }: { item: StoreCard }) => {
    const cover = toAbsoluteMediaUrl(item.sampleImage);
    const subtitle =
      section === "food"
        ? `${item.menuCount} menu items · Customer collection`
        : `${item.menuCount} products`;
    return (
      <Pressable
        style={styles.storeCard}
        onPress={() => setSelectedStoreKey(item.key)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.name}`}
      >
        <View style={styles.storeCardMedia}>
          {cover ? (
            <Image source={{ uri: cover }} resizeMode="cover" style={styles.storeCardImage} />
          ) : (
            <View style={[styles.storeCardImage, styles.storeCardImageFallback]}>
              <Ionicons
                name={section === "food" ? "restaurant-outline" : "cart-outline"}
                size={36}
                color="#94a3b8"
              />
            </View>
          )}
        </View>
        <View style={styles.storeCardBody}>
          <View style={styles.storeCardNameRow}>
            <Ionicons name="storefront-outline" size={16} color="#7dd3fc" />
            <Text style={styles.storeCardName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          {item.address ? (
            <View style={styles.storeCardAddressRow}>
              <Ionicons name="location-outline" size={14} color="#94a3b8" />
              <Text style={styles.storeCardAddress} numberOfLines={2}>
                {item.address}
              </Text>
            </View>
          ) : null}
          <Text style={styles.storeCardMeta}>{subtitle}</Text>
        </View>
      </Pressable>
    );
  };

  if (loading && products.length === 0) {
    return (
      <View style={styles.root}>
        <HubSectionNav section={section} onChange={changeSection} />
        <View style={styles.centerFlex}>
          <ActivityIndicator size="small" color="#22c55e" />
          <Text style={styles.loadingText}>
            {section === "food"
              ? "Loading restaurants..."
              : section === "groceries"
                ? "Loading groceries..."
                : "Loading products..."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <HubSectionNav section={section} onChange={changeSection} />

      {isStoreBrowseSection(section) && selectedStoreKey ? (
        <View style={styles.storeBrowse}>
          <Pressable
            style={styles.backRow}
            onPress={() => setSelectedStoreKey(null)}
            accessibilityRole="button"
            accessibilityLabel="Back to store list"
          >
            <Ionicons name="chevron-back" size={20} color="#e0f2fe" />
            <Text style={styles.backText} numberOfLines={1}>
              {selectedStore?.name || "Stores"}
            </Text>
          </Pressable>
          <FlatList
            key={`hub-${section}-menu`}
            data={menuProducts}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.storeListContent}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={chromeScroll.scrollEventThrottle}
            onScroll={chromeScroll.onScroll}
            onContentSizeChange={chromeScroll.onContentSizeChange}
            onLayout={chromeScroll.onLayout}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
            }
            ItemSeparatorComponent={() => <View style={styles.listGap} />}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {section === "food" ? "No menu items for this restaurant." : "No products for this store."}
              </Text>
            }
            renderItem={renderMenuProduct}
          />
        </View>
      ) : isStoreBrowseSection(section) ? (
        <FlatList
          key={`hub-${section}-stores`}
          data={storeCards}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.storeListContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={chromeScroll.scrollEventThrottle}
          onScroll={chromeScroll.onScroll}
          onContentSizeChange={chromeScroll.onContentSizeChange}
          onLayout={chromeScroll.onLayout}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
          }
          ItemSeparatorComponent={() => <View style={styles.listGap} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {section === "food" ? "No restaurants listed yet." : "No grocery stores listed yet."}
            </Text>
          }
          renderItem={renderStoreCard}
        />
      ) : (
        <FlatList
          key="hub-products"
          data={products}
          keyExtractor={(item) => item._id}
          pagingEnabled
          snapToInterval={pageH}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_data, index) => ({
            length: pageH,
            offset: pageH * index,
            index
          })}
          onEndReachedThreshold={0.6}
          onEndReached={loadMore}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No products available.</Text>}
          ListFooterComponent={
            loadingMore ? (
              <View style={[styles.footer, { height: 48 }]}>
                <ActivityIndicator size="small" color="#22c55e" />
              </View>
            ) : null
          }
          renderItem={renderHubProductPage}
        />
      )}

      <Modal
        visible={detailsLoading || !!selectedProduct || !!detailError}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!adding) {
            setSelectedProduct(null);
            setDetailsLoading(false);
            setDetailError("");
            resetDetailVariants();
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {detailsLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color="#22c55e" />
              </View>
            ) : selectedProduct ? (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Product details</Text>
                {detailImageUri ? (
                  <Image source={{ uri: detailImageUri }} style={styles.modalImage} />
                ) : (
                  <View style={[styles.modalImage, styles.imageFallback]} />
                )}
                {(selectedProduct.images?.length || 0) > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.thumbRow}
                  >
                    {selectedProduct.images!.map((img, idx) => {
                      const uri = toAbsoluteMediaUrl(img);
                      if (!uri) return null;
                      const active = idx === selectedImageIndex;
                      return (
                        <Pressable
                          key={`${uri}-${idx}`}
                          onPress={() => setSelectedImageIndex(idx)}
                          style={[styles.thumbWrap, active && styles.thumbWrapActive]}
                          accessibilityRole="button"
                          accessibilityLabel={`Product image ${idx + 1}`}
                        >
                          <Image source={{ uri }} style={styles.thumbImage} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
                <Text style={styles.modalProductTitle}>
                  {String(selectedProduct.title || "").trim() || "Product"}
                </Text>
                <Text style={styles.modalPrice}>
                  {formatMoney(
                    displayStoreUnitPrice(selectedProduct, section),
                    selectedProduct.currency || deviceCurrency
                  )}
                </Text>
                {/* Web ProductPageClient order: size → color → then description */}
                {productSizes.length > 0 ? (
                  <View style={styles.variantBlock}>
                    <Text style={styles.variantLabel}>
                      Size{selectedSize ? `: ${selectedSize}` : ""}
                    </Text>
                    <View style={styles.chipRow}>
                      {productSizes.map((size) => {
                        const active = size === selectedSize;
                        return (
                          <Pressable
                            key={size}
                            disabled={adding}
                            onPress={() => {
                              setSelectedSize(size);
                              setDetailError("");
                            }}
                            style={[
                              styles.chip,
                              active && styles.chipActive,
                              !selectedSize && styles.chipWarn
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Select size ${size}`}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{size}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                {productColors.length > 0 ? (
                  <View style={styles.variantBlock}>
                    <Text style={styles.variantLabel}>
                      Color{selectedColor?.name ? `: ${selectedColor.name}` : ""}
                    </Text>
                    <View style={styles.chipRow}>
                      {productColors.map((color) => {
                        const active = color.name === selectedColor?.name;
                        return (
                          <Pressable
                            key={`${color.name}-${color.imageIndex ?? 0}`}
                            disabled={adding}
                            onPress={() => {
                              setSelectedColor(color);
                              setDetailError("");
                              if (
                                typeof color.imageIndex === "number" &&
                                color.imageIndex >= 0 &&
                                selectedProduct.images?.[color.imageIndex]
                              ) {
                                setSelectedImageIndex(color.imageIndex);
                              }
                            }}
                            style={[
                              styles.chip,
                              styles.colorChip,
                              active && styles.chipActive,
                              !selectedColor && styles.chipWarn
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Select color ${color.name}`}
                          >
                            <View style={[styles.swatch, { backgroundColor: color.hex || "#cbd5e1" }]} />
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {color.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                {selectedProduct.description ? (
                  <Text style={styles.modalDesc} numberOfLines={4}>
                    {String(selectedProduct.description).replace(/<[^>]+>/g, " ").trim()}
                  </Text>
                ) : null}
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => setAddQty((v) => Math.max(1, v - 1))}
                    style={styles.qtyBtn}
                    disabled={adding}
                  >
                    <Text style={styles.qtyBtnText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{addQty}</Text>
                  <Pressable onPress={() => setAddQty((v) => v + 1)} style={styles.qtyBtn} disabled={adding}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
                {detailError ? <Text style={styles.errorText}>{detailError}</Text> : null}
                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.modalCancelBtn}
                    onPress={() => {
                      if (!adding) {
                        setSelectedProduct(null);
                        setDetailError("");
                        resetDetailVariants();
                      }
                    }}
                    disabled={adding}
                  >
                    <Text style={styles.modalCancelText}>Close</Text>
                  </Pressable>
                  <Pressable style={styles.modalPrimaryBtn} onPress={() => void addToCart()} disabled={adding}>
                    <Text style={styles.modalPrimaryText}>{adding ? "Adding..." : "Add to cart"}</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={styles.goCartBtn}
                  onPress={() => {
                    setSelectedProduct(null);
                    setDetailError("");
                    resetDetailVariants();
                    onGoToCart?.();
                  }}
                >
                  <Text style={styles.goCartText}>Go to cart</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <>
                <Text style={styles.modalTitle}>Product details</Text>
                <Text style={styles.errorText}>{detailError || "Could not load details."}</Text>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setDetailError("");
                    setSelectedProduct(null);
                  }}
                >
                  <Text style={styles.modalCancelText}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function HubSectionNav({
  section,
  onChange
}: {
  section: HubSection;
  onChange: (s: HubSection) => void;
}) {
  const items: { id: HubSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: "hub", label: "QwertyHub", icon: "bag-handle-outline" },
    { id: "food", label: "Food", icon: "restaurant-outline" },
    { id: "groceries", label: "Groceries", icon: "cart-outline" }
  ];
  return (
    <View style={styles.sectionNav} accessibilityLabel="QwertyHub sections">
      {items.map((item) => {
        const active = section === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            style={[styles.sectionChip, active && styles.sectionChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              item.id === "food"
                ? "Order Food/Restaurant"
                : item.id === "groceries"
                  ? "Order Groceries"
                  : "QwertyHub"
            }
          >
            <Ionicons name={item.icon} size={16} color={active ? "#0369a1" : "#64748b"} />
            <Text style={[styles.sectionChipText, active && styles.sectionChipTextActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a"
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f172a"
  },
  centerFlex: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8
  },
  sectionNav: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: "#0f172a",
    zIndex: 2
  },
  sectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1e293b"
  },
  sectionChipActive: {
    borderColor: "#7dd3fc",
    backgroundColor: "#0c4a6e"
  },
  sectionChipText: {
    ...appTypography.labelSm,
    color: "#cbd5e1",
    fontWeight: "700"
  },
  sectionChipTextActive: {
    color: "#e0f2fe"
  },
  storeBrowse: {
    flex: 1
  },
  storeListContent: {
    paddingHorizontal: 12,
    paddingBottom: 24
  },
  listGap: {
    height: 12
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  backText: {
    ...appTypography.meta,
    color: "#e0f2fe",
    fontWeight: "700",
    flex: 1
  },
  storeCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden"
  },
  storeCardMedia: {
    height: 140,
    backgroundColor: "#0f172a"
  },
  storeCardImage: {
    width: "100%",
    height: "100%"
  },
  storeCardImageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b"
  },
  storeCardBody: {
    padding: 14,
    gap: 6
  },
  storeCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  storeCardName: {
    ...appTypography.titleMd,
    color: "#f8fafc",
    fontWeight: "800",
    flex: 1
  },
  storeCardAddressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6
  },
  storeCardAddress: {
    ...appTypography.meta,
    color: "#94a3b8",
    flex: 1,
    lineHeight: 18
  },
  storeCardMeta: {
    ...appTypography.meta,
    color: "#7dd3fc",
    fontWeight: "600"
  },
  menuCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden"
  },
  menuCardMedia: {
    height: 180,
    backgroundColor: "#0f172a"
  },
  menuCardImage: {
    width: "100%",
    height: "100%"
  },
  menuCardBody: {
    padding: 12,
    gap: 4
  },
  menuCardTitle: {
    ...appTypography.titleMd,
    color: "#f8fafc",
    fontWeight: "800"
  },
  menuCardPrice: {
    ...appTypography.meta,
    color: "#7dd3fc",
    fontWeight: "800",
    fontSize: 16
  },
  menuCardDesc: {
    ...appTypography.meta,
    color: "#94a3b8",
    lineHeight: 18
  },
  loadingText: {
    ...appTypography.meta,
    color: "#e2e8f0",
    fontWeight: "600"
  },
  emptyText: {
    ...appTypography.meta,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 40
  },
  footer: { justifyContent: "center", alignItems: "center" },
  page: {
    width: "100%",
    backgroundColor: "#0f172a",
    overflow: "hidden",
    justifyContent: "center"
  },
  productImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%"
  },
  imageFallback: { backgroundColor: "#1e293b" },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.12)"
  },
  resellTop: {
    position: "absolute",
    top: 14,
    left: 14,
    zIndex: 3,
    borderRadius: 999,
    backgroundColor: "rgba(14,165,233,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  resellBadgeText: {
    ...appTypography.badge,
    color: "#fff",
    fontWeight: "800"
  },
  bottomMeta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingRight: 72,
    paddingTop: 28,
    paddingBottom: 22,
    backgroundColor: "rgba(15,23,42,0.55)",
    gap: 4
  },
  productTitle: {
    ...appTypography.titleMd,
    color: "#fff",
    fontSize: 20,
    fontWeight: "800"
  },
  productPrice: {
    ...appTypography.meta,
    color: "#7dd3fc",
    fontWeight: "800",
    fontSize: 18
  },
  productStock: {
    ...appTypography.meta,
    color: "#cbd5e1"
  },
  productDesc: {
    ...appTypography.meta,
    color: "#e2e8f0",
    marginTop: 4,
    lineHeight: 18
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    padding: 18
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    maxHeight: Dimensions.get("window").height * 0.88,
    overflow: "hidden"
  },
  modalScroll: {
    maxHeight: Dimensions.get("window").height * 0.88 - 32
  },
  modalScrollContent: {
    gap: 10,
    paddingBottom: 8
  },
  thumbRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2
  },
  thumbWrap: {
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 10,
    overflow: "hidden"
  },
  thumbWrapActive: {
    borderColor: "#0ea5e9"
  },
  thumbImage: {
    width: 52,
    height: 52,
    backgroundColor: "#f1f5f9"
  },
  modalTitle: {
    ...appTypography.titleMd,
    color: "#0f172a"
  },
  modalImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "#f1f5f9"
  },
  modalProductTitle: {
    ...appTypography.meta,
    fontWeight: "800",
    color: "#0f172a"
  },
  modalDesc: {
    ...appTypography.meta,
    color: "#475569"
  },
  modalPrice: {
    ...appTypography.titleMd,
    color: socialTheme.brandBlue
  },
  variantBlock: {
    gap: 6
  },
  variantLabel: {
    ...appTypography.meta,
    fontWeight: "700",
    color: "#334155"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  colorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999
  },
  chipActive: {
    borderColor: "#0ea5e9",
    backgroundColor: "#f0f9ff"
  },
  chipWarn: {
    borderColor: "#fbbf24",
    backgroundColor: "#fffbeb"
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155"
  },
  chipTextActive: {
    color: "#0c4a6e"
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#94a3b8"
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center"
  },
  qtyBtnText: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  qtyValue: { fontSize: 16, fontWeight: "700", minWidth: 24, textAlign: "center" },
  errorText: { color: "#dc2626", fontSize: 13 },
  modalActions: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 12,
    alignItems: "center"
  },
  modalCancelText: { fontWeight: "700", color: "#334155" },
  modalPrimaryBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: socialTheme.brandBlue,
    paddingVertical: 12,
    alignItems: "center"
  },
  modalPrimaryText: { fontWeight: "800", color: "#fff" },
  goCartBtn: { alignItems: "center", paddingVertical: 8 },
  goCartText: { color: socialTheme.brandBlue, fontWeight: "700" }
});
