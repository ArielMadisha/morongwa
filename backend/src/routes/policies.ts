import express, { Request, Response } from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  ensureDefaultPolicies,
  listPublishedPolicies,
  getPublishedPolicy,
  createPolicyVersion,
  publishPolicyVersion,
  recordPolicyAcceptance,
  listPolicyVersions,
} from "../services/policyService";

const router = express.Router();

// Public: list published policies
router.get("/", async (_req: Request, res: Response, next) => {
  try {
    const policies = await listPublishedPolicies();
    const mapped = policies.map((p) => {
      const published = p.versions.find((v) => v.status === "published" && v.version === p.latestPublishedVersion);
      return {
        slug: p.slug,
        title: p.title,
        category: p.category,
        tags: p.tags,
        countryScope: p.countryScope,
        latestPublishedVersion: p.latestPublishedVersion,
        summary: published?.summary || "",
        publishedAt: published?.publishedAt,
      };
    });
    res.json({ success: true, data: mapped });
  } catch (err) {
    next(err);
  }
});

// Public: get single published policy
router.get("/:slug", async (req: Request, res: Response, next) => {
  try {
    const { slug } = req.params;
    const result = await getPublishedPolicy(slug);
    if (!result) throw new AppError("Policy not found", 404);

    res.json({
      success: true,
      data: {
        slug,
        title: result.policy.title,
        category: result.policy.category,
        tags: result.policy.tags,
        countryScope: result.policy.countryScope,
        version: result.version.version,
        publishedAt: result.version.publishedAt,
        summary: result.version.summary,
        content: result.version.content,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Admin: list versions
router.get("/:slug/versions", authenticate, authorize("admin", "superadmin"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { slug } = req.params;
    const policy = await listPolicyVersions(slug);
    if (!policy) throw new AppError("Policy not found", 404);
    res.json({ success: true, data: policy.versions });
  } catch (err) {
    next(err);
  }
});

// Admin: create version
router.post("/:slug/version", authenticate, authorize("admin", "superadmin"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { slug } = req.params;
    const { title, summary, content, publish } = req.body;
    if (!content) throw new AppError("Content is required", 400);
    const version = await createPolicyVersion(slug, { title, summary, content }, req.user?._id?.toString(), publish);
    res.status(201).json({ success: true, data: version });
  } catch (err) {
    next(err);
  }
});

// Admin: publish a specific version
router.post("/:slug/publish", authenticate, authorize("admin", "superadmin"), async (req: AuthRequest, res: Response, next) => {
  try {
    const { slug } = req.params;
    const { version } = req.body;
    if (!version) throw new AppError("Version is required", 400);
    const published = await publishPolicyVersion(slug, Number(version), req.user?._id?.toString());
    res.json({ success: true, data: published });
  } catch (err) {
    next(err);
  }
});

// Authenticated: record acceptance for one or more policies
router.post("/accept", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { slugs, meta } = req.body as { slugs: string[]; meta?: any };
    if (!Array.isArray(slugs) || slugs.length === 0) throw new AppError("slugs array is required", 400);

    const results = [] as any[];
    for (const slug of slugs) {
      const acceptance = await recordPolicyAcceptance(slug, req.user?._id?.toString() || null, req.ip, req.headers["user-agent"], meta);
      results.push({ slug, version: acceptance.version, acceptedAt: acceptance.acceptedAt });
    }

    res.status(201).json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

// Utility: seed defaults (admin only)
router.post("/seed/defaults", authenticate, authorize("superadmin"), async (req: AuthRequest, res: Response, next) => {
  try {
    await ensureDefaultPolicies(req.user?._id?.toString());
    res.json({ success: true, message: "Policies ensured" });
  } catch (err) {
    next(err);
  }
});

export default router;
