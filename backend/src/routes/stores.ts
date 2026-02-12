import express, { Response } from "express";
import Store from "../data/models/Store";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { slugify } from "../utils/helpers";

const router = express.Router();

/** GET /api/stores/me – list current user's stores */
router.get("/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const stores = await Store.find({ userId: req.user!._id })
      .populate("supplierId", "storeName status")
      .lean();
    res.json({ data: stores });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/stores/:id – rename store (owner only) */
router.put("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body as { name?: string };
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new AppError("name is required", 400);
    }
    const store = await Store.findOne({ _id: id, userId: req.user!._id });
    if (!store) throw new AppError("Store not found", 404);
    const baseSlug = slugify(name.trim());
    let slug = baseSlug;
    let n = 1;
    while (await Store.findOne({ slug, _id: { $ne: store._id } })) {
      slug = `${baseSlug}-${++n}`;
    }
    store.name = name.trim();
    store.slug = slug;
    await store.save();
    res.json({ message: "Store updated", data: store });
  } catch (err) {
    next(err);
  }
});

/** GET /api/stores/by-slug/:slug – public store by slug (for store page) */
router.get("/by-slug/:slug", async (req: express.Request, res: Response, next) => {
  try {
    const store = await Store.findOne({ slug: req.params.slug })
      .populate("userId", "name")
      .populate("supplierId", "storeName status")
      .lean();
    if (!store) return res.status(404).json({ error: true, message: "Store not found" });
    res.json({ data: store });
  } catch (err) {
    next(err);
  }
});

export default router;
