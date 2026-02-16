import express, { Response } from "express";
import Store from "../data/models/Store";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { slugify } from "../utils/helpers";
import { upload } from "../middleware/upload";

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

/** PUT /api/stores/:id – update store (owner only). Fields: name, address, email, cellphone, whatsapp, stripBackgroundPic */
router.put("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const body = req.body as {
      name?: string;
      address?: string;
      email?: string;
      cellphone?: string;
      whatsapp?: string;
      stripBackgroundPic?: string;
    };
    const store = await Store.findOne({ _id: id, userId: req.user!._id });
    if (!store) throw new AppError("Store not found", 404);

    if (body.name != null && typeof body.name === "string" && body.name.trim()) {
      const baseSlug = slugify(body.name.trim());
      let slug = baseSlug;
      let n = 1;
      while (await Store.findOne({ slug, _id: { $ne: store._id } })) {
        slug = `${baseSlug}-${++n}`;
      }
      store.name = body.name.trim();
      store.slug = slug;
    }
    if (body.address !== undefined) store.address = body.address?.trim() || undefined;
    if (body.email !== undefined) store.email = body.email?.trim() || undefined;
    if (body.cellphone !== undefined) store.cellphone = body.cellphone?.trim() || undefined;
    if (body.whatsapp !== undefined) store.whatsapp = body.whatsapp?.trim() || undefined;
    if (body.stripBackgroundPic !== undefined) store.stripBackgroundPic = body.stripBackgroundPic?.trim() || undefined;

    await store.save();
    res.json({ message: "Store updated", data: store });
  } catch (err) {
    next(err);
  }
});

/** POST /api/stores/:id/strip-background – upload strip background image (owner only) */
router.post(
  "/:id/strip-background",
  authenticate,
  upload.single("image"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { id } = req.params;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file || !file.mimetype?.startsWith("image/")) {
        throw new AppError("A valid image file is required", 400);
      }
      const store = await Store.findOne({ _id: id, userId: req.user!._id });
      if (!store) throw new AppError("Store not found", 404);
      const baseRaw = process.env.API_URL || `${req.protocol}://${req.get("host")}`;
      const base = baseRaw.replace(/\/api\/?$/, "").replace(/\/$/, "");
      const url = `${base}/uploads/${file.filename}`;
      store.stripBackgroundPic = url;
      await store.save();
      res.status(201).json({ url, data: store });
    } catch (err) {
      next(err);
    }
  }
);

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
