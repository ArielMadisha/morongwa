export const PRICING_CONFIG = {
  ZAR: {
    baseRadiusKm: 5,
    bookingFeeLocal: 8.0,
    perKmRateLocal: 10.0,
  },
} as const;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export const calculateDistanceKm = (coords1: [number, number], coords2: [number, number]): number => {
  const R = 6371; // km
  const dLat = toRad(coords2[1] - coords1[1]);
  const dLon = toRad(coords2[0] - coords1[0]);
  const lat1 = toRad(coords1[1]);
  const lat2 = toRad(coords2[1]);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const suggestFeeZAR = (distanceKm?: number): number | null => {
  if (distanceKm === undefined || distanceKm === null) return null;
  const cfg = PRICING_CONFIG.ZAR;
  const extraKm = Math.max(0, distanceKm - cfg.baseRadiusKm);
  const fee = cfg.bookingFeeLocal + extraKm * cfg.perKmRateLocal;
  return Math.round(fee * 100) / 100;
};
