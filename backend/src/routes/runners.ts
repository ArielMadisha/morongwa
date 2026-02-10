import express from 'express';
import User from '../data/models/User';
import { authenticate } from '../middleware/auth';
import { calculateDistance } from '../utils/helpers';

const router = express.Router();

// GET /api/runners/nearby?lat=...&lon=...&radius=km
router.get('/nearby', authenticate, async (req, res, next) => {
  try {
    const { lat, lon, radius } = req.query;
    if (!lat || !lon) return res.status(400).json({ message: 'lat and lon required' });
    const latNum = parseFloat(lat as string);
    const lonNum = parseFloat(lon as string);
    const radiusKm = radius ? parseFloat(radius as string) : 10;

    const runners = await User.find({ role: 'runner', active: true, suspended: false }).lean();

    const result = [];
    for (const r of runners) {
      if (!r.location || !r.location.coordinates) continue;
      const rLon = r.location.coordinates[0];
      const rLat = r.location.coordinates[1];
      const dist = calculateDistance([lonNum, latNum], [rLon, rLat]);
      if (dist <= radiusKm) {
        result.push({
          _id: r._id,
          name: r.name,
          lat: rLat,
          lon: rLon,
          distanceKm: Math.round(dist * 100) / 100,
        });
      }
    }

    // sort by distance
    result.sort((a: any, b: any) => a.distanceKm - b.distanceKm);
    res.json({ runners: result.slice(0, 20), count: result.length });
  } catch (err) {
    next(err);
  }
});

export default router;
