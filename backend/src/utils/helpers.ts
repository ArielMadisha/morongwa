// Helper functions for common operations
export const formatCurrency = (amount: number, currency = "ZAR"): string => {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(amount);
};

export const calculateAverage = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
};

export const generateReference = (prefix = "REF"): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
};

export const formatDate = (date: Date, format = "short"): string => {
  const options: Intl.DateTimeFormatOptions =
    format === "long"
      ? { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-ZA", options).format(date);
};

export const calculateDistance = (
  coords1: [number, number],
  coords2: [number, number]
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(coords2[1] - coords1[1]);
  const dLon = toRad(coords2[0] - coords1[0]);
  const lat1 = toRad(coords1[1]);
  const lat2 = toRad(coords2[1]);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

export const sanitizeInput = (input: string): string => {
  return input.replace(/<script[^>]*>.*?<\/script>/gi, "").trim();
};

/** Create URL-safe slug from name; optional suffix for uniqueness */
export function slugify(name: string, suffix?: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return suffix ? `${base}-${suffix}` : base || "store";
}

export const paginationDefaults = {
  limit: 20,
  page: 1,
  maxLimit: 100,
};

export const getPaginationParams = (
  page?: number,
  limit?: number
): { skip: number; limit: number } => {
  const p = Math.max(1, page || paginationDefaults.page);
  const l = Math.min(limit || paginationDefaults.limit, paginationDefaults.maxLimit);
  return {
    skip: (p - 1) * l,
    limit: l,
  };
};
