import type { IUser } from "../data/models/User";
import Task from "../data/models/Task";
import { PRICING_CONFIG, type Country } from "../config/fees.config";
import { getRunnerServiceCity, getRunnerServiceCountry } from "../data/runnerServiceAreas";
import { calculateDistance } from "../utils/helpers";
import { getRunnerCategory } from "./runnerVerification";

export function resolveRunnerMatchRadiusKm(currency: Country = "ZAR"): number {
  const cfg = PRICING_CONFIG[currency];
  const base = Number(cfg?.baseRadiusKm ?? 5);
  // Match radius = included base radius + reasonable service buffer for hub cities
  return Math.max(base, 15);
}

export function resolveTaskPickupCoordinates(task: {
  pickupLocation?: { coordinates?: number[] };
  workflowMeta?: Record<string, any>;
}): [number, number] | null {
  const coords = task.pickupLocation?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return [lng, lat];
    }
  }
  const meta = task.workflowMeta || {};
  const cityId = meta.collectionCity || meta.runnerServiceCity;
  const countryCode = meta.originCountry || meta.runnerServiceCountry;
  const city = getRunnerServiceCity(String(countryCode || "ZA"), String(cityId || ""));
  if (city) return [city.lng, city.lat];
  return null;
}

export function resolveRunnerAnchorCoordinates(runner: IUser): [number, number] | null {
  if (runner.location?.coordinates && runner.location.coordinates.length >= 2) {
    const lng = Number(runner.location.coordinates[0]);
    const lat = Number(runner.location.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return [lng, lat];
    }
  }
  const city = getRunnerServiceCity(runner.runnerServiceCountry, runner.runnerServiceCity);
  if (city) return [city.lng, city.lat];
  return null;
}

export function runnerMatchesTaskCategory(runner: IUser, taskType: string): boolean {
  const category = getRunnerCategory(runner);
  const t = String(taskType || "").toLowerCase();
  if (["transport", "large_transport"].includes(t)) return category === "courier";
  if (["shop_send", "shop_and_send", "collect_send", "cross_border_collection"].includes(t)) {
    return category === "store_parcel" || category === "courier";
  }
  if (t === "local" || t === "general") return true;
  return true;
}

export function isRunnerWithinTaskRadius(
  runner: IUser,
  taskPickup: [number, number],
  radiusKm: number
): boolean {
  const anchor = resolveRunnerAnchorCoordinates(runner);
  if (!anchor) return false;
  const dist = calculateDistance(taskPickup, anchor);
  return dist <= radiusKm;
}

export function resolveMatchRadiusForTask(task: {
  workflowMeta?: Record<string, any>;
  pickupLocation?: { coordinates?: number[] };
}): number {
  const meta = task.workflowMeta || {};
  const country = getRunnerServiceCountry(String(meta.originCountry || meta.runnerServiceCountry || "ZA"));
  const currency = (country?.currency || "ZAR") as Country;
  return resolveRunnerMatchRadiusKm(currency);
}
