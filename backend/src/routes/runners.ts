import express from "express";
import User from "../data/models/User";
import { authenticate } from "../middleware/auth";
import { calculateDistance } from "../utils/helpers";
import {
  isRunnerWithinTaskRadius,
  resolveRunnerAnchorCoordinates,
  resolveRunnerMatchRadiusKm,
} from "../services/runnerMatchingRules";
import { getRunnerServiceCountry, RUNNER_SERVICE_COUNTRIES } from "../data/runnerServiceAreas";
import type { Country } from "../config/fees.config";

const router = express.Router();

router.get("/service-areas", (_req, res) => {
  res.json({
    countries: RUNNER_SERVICE_COUNTRIES.map((c) => ({
      code: c.code,
      name: c.name,
      cities: c.cities.map((city) => ({ id: city.id, name: city.name })),
    })),
  });
});

// GET /api/runners/nearby?lat=...&lon=...&radius=km&country=ZA
router.get("/nearby", authenticate, async (req, res, next) => {
  try {
    const { lat, lon, radius, country, runnerCategory } = req.query;
    if (!lat || !lon) return res.status(400).json({ message: "lat and lon required" });
    const latNum = parseFloat(lat as string);
    const lonNum = parseFloat(lon as string);
    const pickup: [number, number] = [lonNum, latNum];

    const countryCfg = getRunnerServiceCountry(String(country || "ZA"));
    const currency = (countryCfg?.currency || "ZAR") as Country;
    const defaultRadius = resolveRunnerMatchRadiusKm(currency);
    const radiusKm = radius ? parseFloat(radius as string) : defaultRadius;

    const query: Record<string, unknown> = {
      role: "runner",
      active: true,
      suspended: false,
      runnerVerified: true,
    };
    if (runnerCategory) query.runnerCategory = String(runnerCategory);

    const runners = await User.find(query).lean();
    const result = [];

    for (const r of runners) {
      if (!isRunnerWithinTaskRadius(r as any, pickup, radiusKm)) continue;
      const anchor = resolveRunnerAnchorCoordinates(r as any);
      if (!anchor) continue;
      const dist = calculateDistance(pickup, anchor);
      result.push({
        _id: r._id,
        name: r.name,
        runnerCategory: (r as any).runnerCategory,
        runnerServiceCountry: (r as any).runnerServiceCountry,
        runnerServiceCity: (r as any).runnerServiceCity,
        lat: anchor[1],
        lon: anchor[0],
        distanceKm: Math.round(dist * 100) / 100,
      });
    }

    result.sort((a: any, b: any) => a.distanceKm - b.distanceKm);
    res.json({ runners: result.slice(0, 20), count: result.length, radiusKm });
  } catch (err) {
    next(err);
  }
});

export default router;
