// User management routes
import express, { Response } from "express";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import User from "../data/models/User";
import AuditLog from "../data/models/AuditLog";
import TVPost from "../data/models/TVPost";
import Follow from "../data/models/Follow";
import Song from "../data/models/Song";
import { authenticate, authenticateOptional, AuthRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { computePhoneLocale } from "../utils/phoneCountryCurrency";
import { isValidForOtp } from "../utils/phoneValidation";
import { emitRunnerLocation } from "../services/notification";
import { moderateMedia } from "../services/contentModeration";
import { inferIsSchoolAccountForPublicProfile } from "../utils/schoolProfileDetection";
import {
  canEditSchoolProfile,
  canManageSchoolManagers,
  schoolManagerIdStrings,
} from "../utils/schoolPageAccess";
import { sanitizeUserForClient } from "../utils/userDisplayLabel";
import { applySchoolProfileMediaToUser } from "../utils/schoolProfileMedia";
import { applyResolvedAvatarToUserPayload } from "../utils/resolveUserAvatar";

const UPLOADS_ROOT = path.resolve(__dirname, "../../uploads");

async function clientUserPayload(user: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sanitized = sanitizeUserForClient(user) as Record<string, unknown>;
  const withSchool = applySchoolProfileMediaToUser(sanitized, UPLOADS_ROOT);
  return applyResolvedAvatarToUserPayload(withSchool, UPLOADS_ROOT);
}
import {
  geocodePlaceLabel,
  hasPublicProfileMapCoords,
  parsePublicProfileLocationUpdate,
  publicProfileLocationForViewer,
} from "../utils/publicProfileLocation";
import { publishProfileAvatarFeedUpdate } from "../services/profileAvatarFeed";
import {
  applyPublicContactPrivacy,
  resolvePublicProfileKind,
  sanitizeUsersForClientView,
} from "../utils/publicContactPrivacy";

const router = express.Router();

function isValidGalleryUploadPath(p: string): boolean {
  const s = p.trim();
  return s.startsWith("/uploads/") && !s.includes("..") && s.length <= 512;
}

const SCHOOL_PUBLIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Get user profile with stats (postCount, followerCount, followingCount) - public for profile page
router.get("/:id/profile-stats", authenticateOptional, async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError("Invalid user id", 400);
    const user = await User.findById(id).select("-passwordHash").lean();
    if (!user) throw new AppError("User not found", 404);
    if (Array.isArray((user as { role?: string[] }).role) && (user as { role?: string[] }).role!.includes("superadmin")) {
      throw new AppError("User not found", 404);
    }

    const [postCount, imageCount, videoCount, musicCount, musicUploadCount, followerCount, followingCount] =
      await Promise.all([
        TVPost.countDocuments({ creatorId: id, status: "approved" }),
        TVPost.countDocuments({ creatorId: id, status: "approved", type: { $in: ["image", "carousel"] } }),
        TVPost.countDocuments({ creatorId: id, status: "approved", type: "video" }),
        TVPost.countDocuments({ creatorId: id, status: "approved", type: "audio" }),
        Song.countDocuments({ userId: id }),
        Follow.countDocuments({ followingId: id, status: "accepted" }),
        Follow.countDocuments({ followerId: id, status: "accepted" }),
      ]);

    const inferredSchool = inferIsSchoolAccountForPublicProfile(user as { isSchoolAccount?: boolean; name?: string });
    const userWithSchoolFlag = {
      ...user,
      isSchoolAccount: inferredSchool,
    };
    const sanitizedForGallery = applySchoolProfileMediaToUser(
      userWithSchoolFlag as Record<string, unknown>,
      UPLOADS_ROOT
    );
    const galleryCount = Array.isArray(sanitizedForGallery.profileGalleryUrls)
      ? (sanitizedForGallery.profileGalleryUrls as string[]).filter(Boolean).length
      : 0;
    const effectivePostCount = Math.max(postCount, galleryCount);
    const effectiveImageCount = Math.max(imageCount, galleryCount);

    let schoolPage: {
      canEditProfile: boolean;
      canManageManagers: boolean;
      managerCount: number;
      isOwner: boolean;
    } | null = null;
    if (inferredSchool && req.user) {
      const actorId = req.user._id.toString();
      schoolPage = {
        canEditProfile: canEditSchoolProfile(actorId, user as any),
        canManageManagers: canManageSchoolManagers(actorId, user as any),
        managerCount: schoolManagerIdStrings(user as any).length,
        isOwner: actorId === String((user as { _id?: unknown })._id ?? id),
      };
    }

    const canEditProfile =
      !!schoolPage?.canEditProfile || req.user?._id.toString() === id;
    const profileKind = await resolvePublicProfileKind(id, user as { isSchoolAccount?: boolean; name?: string });
    let sanitized = await clientUserPayload(userWithSchoolFlag as Record<string, unknown>);
    sanitized.publicProfileLocation = publicProfileLocationForViewer(
      (user as { publicProfileLocation?: { enabled: boolean; label?: string; lat?: number; lng?: number } })
        .publicProfileLocation,
      canEditProfile
    );
    sanitized = applyPublicContactPrivacy(sanitized, {
      viewerId: req.user?._id?.toString(),
      ownerId: id,
      profileKind,
    });

    res.json({
      user: sanitized,
      publicProfileKind: profileKind,
      postCount: effectivePostCount,
      imageCount: effectiveImageCount,
      videoCount,
      musicCount,
      musicUploadCount,
      followerCount,
      followingCount,
      schoolPage,
    });
  } catch (err) {
    next(err);
  }
});

// Get user profile
router.get("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);

    const ownerId = user._id.toString();
    const profileKind = await resolvePublicProfileKind(ownerId, user as { isSchoolAccount?: boolean; name?: string });
    let payload = await clientUserPayload(user.toJSON() as Record<string, unknown>);
    payload = applyPublicContactPrivacy(payload, {
      viewerId: req.user!._id.toString(),
      ownerId,
      profileKind,
    });

    res.json({ user: payload, publicProfileKind: profileKind });
  } catch (err) {
    next(err);
  }
});

// Update user profile (self, or school page co-manager editing the school account)
router.put("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const targetId = req.params.id;
    const actorId = req.user!._id.toString();
    if (actorId !== targetId) {
      const targetSchool = await User.findById(targetId)
        .select("schoolPageManagers isSchoolAccount name _id")
        .lean();
      if (!targetSchool || !canEditSchoolProfile(actorId, targetSchool as any)) {
        throw new AppError("Unauthorized", 403);
      }
    }

    const {
      name,
      username,
      phone,
      isPrivate,
      avatar,
      stripBackgroundPic,
      profileGalleryUrls,
      schoolPublicEmail,
      publicProfileLocation,
      showPhonePublicly,
    } = req.body;
    const updates: any = {};
    if (name) updates.name = name;
    if (typeof phone === "string") {
      const digits = phone.replace(/\D/g, "");
      updates.phone = digits.length >= 10 ? digits : null;
      if (updates.phone) {
        const phoneCheck = isValidForOtp(phone);
        if (!phoneCheck.valid) throw new AppError(phoneCheck.reason || "Invalid phone", 400);
        const taken = await User.findOne({
          _id: { $ne: targetId },
          $or: [{ phone: updates.phone }, { email: `wa_${updates.phone}@morongwa.local` }],
        });
        if (taken) throw new AppError("Phone already in use", 400);
        const loc = computePhoneLocale(updates.phone);
        if (loc.countryCode) {
          updates.countryCode = loc.countryCode;
          updates.preferredCurrency = loc.preferredCurrency;
        }
      } else {
        updates.countryCode = null;
        updates.preferredCurrency = null;
      }
    }
    if (typeof username === "string" && username.trim()) {
      const uname = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 30);
      if (uname.length >= 2) {
        const existing = await User.findOne({ username: uname, _id: { $ne: targetId } });
        if (existing) throw new AppError("Username already taken", 400);
        updates.username = uname;
      }
    }
    if (typeof isPrivate === "boolean") updates.isPrivate = isPrivate;
    if (typeof showPhonePublicly === "boolean" && actorId === targetId) {
      const targetForKind =
        (await User.findById(targetId).select("isSchoolAccount name").lean()) || null;
      if (targetForKind) {
        const kind = await resolvePublicProfileKind(targetId, targetForKind as { isSchoolAccount?: boolean; name?: string });
        if (kind === "individual") {
          updates.showPhonePublicly = showPhonePublicly;
        }
      }
    }
    let previousAvatar: string | null | undefined;
    if (typeof avatar === "string" && avatar.trim()) {
      const existing = await User.findById(targetId).select("avatar").lean();
      previousAvatar = (existing as { avatar?: string } | null)?.avatar ?? null;
      updates.avatar = avatar.trim();
    }
    if (typeof stripBackgroundPic === "string") updates.stripBackgroundPic = stripBackgroundPic.trim() || null;

    if (Array.isArray(profileGalleryUrls)) {
      const cleaned = profileGalleryUrls
        .filter((u: unknown) => typeof u === "string")
        .map((u: string) => u.trim())
        .filter((u: string) => isValidGalleryUploadPath(u))
        .slice(0, 12);
      updates.profileGalleryUrls = cleaned;
    }
    if (typeof schoolPublicEmail === "string") {
      const em = schoolPublicEmail.trim().toLowerCase();
      if (!em) {
        updates.schoolPublicEmail = null;
      } else if (!SCHOOL_PUBLIC_EMAIL_RE.test(em)) {
        throw new AppError("Invalid public contact email", 400);
      } else {
        updates.schoolPublicEmail = em;
      }
    }

    if (publicProfileLocation !== undefined) {
      try {
        const parsed = parsePublicProfileLocationUpdate(publicProfileLocation);
        if (!parsed) {
          throw new AppError("Invalid profile location", 400);
        }
        if (parsed.enabled) {
          if (!hasPublicProfileMapCoords(parsed) && parsed.label) {
            const geo = await geocodePlaceLabel(parsed.label);
            if (geo) {
              parsed.lat = geo.lat;
              parsed.lng = geo.lng;
            }
          }
          if (!hasPublicProfileMapCoords(parsed)) {
            throw new AppError(
              "Set an area name or use “Use my location” before enabling profile location",
              400
            );
          }
        }
        updates.publicProfileLocation = parsed;
      } catch (err) {
        if (err instanceof AppError) throw err;
        const msg = err instanceof Error ? err.message : "Invalid profile location";
        throw new AppError(msg, 400);
      }
    }

    const user = await User.findByIdAndUpdate(targetId, updates, { new: true }).select(
      "-passwordHash"
    );

    if (!user) throw new AppError("User not found", 404);

    await AuditLog.create({
      action: "USER_UPDATED",
      user: user._id,
      meta: { updates },
    });

    let feedPostId: string | undefined;
    if (updates.avatar) {
      const feed = await publishProfileAvatarFeedUpdate({
        userId: user._id,
        avatarPath: updates.avatar,
        previousAvatar,
      });
      feedPostId = feed.postId;
    }

    const clientUser = sanitizeUserForClient(user.toJSON() as Record<string, unknown>) as Record<
      string,
      unknown
    >;
    if (clientUser) {
      clientUser.publicProfileLocation = publicProfileLocationForViewer(
        (user as { publicProfileLocation?: { enabled: boolean; label?: string; lat?: number; lng?: number } })
          .publicProfileLocation,
        true
      );
    }

    res.json({
      message: "Profile updated successfully",
      user: clientUser,
      feedPostId,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/remove-gallery-photo — delete one profile gallery image (account owner only)
router.post("/:id/remove-gallery-photo", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const targetId = req.params.id;
    const actorId = req.user!._id.toString();
    if (actorId !== targetId) {
      throw new AppError("You can only delete photos on your own profile", 403);
    }
    if (!mongoose.Types.ObjectId.isValid(targetId)) throw new AppError("Invalid user id", 400);

    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url || !isValidGalleryUploadPath(url)) throw new AppError("Invalid gallery photo URL", 400);

    const user = await User.findById(targetId);
    if (!user) throw new AppError("User not found", 404);

    const gallery = Array.isArray(user.profileGalleryUrls)
      ? user.profileGalleryUrls.map((u) => String(u || "").trim()).filter(Boolean)
      : [];
    const nextGallery = gallery.filter((u) => u !== url);
    if (nextGallery.length === gallery.length) {
      throw new AppError("Photo not found on your profile", 404);
    }

    user.profileGalleryUrls = nextGallery;
    if (user.avatar && String(user.avatar).trim() === url) {
      user.avatar = nextGallery[0] || undefined;
    }
    await user.save();

    await TVPost.deleteMany({
      creatorId: targetId,
      status: "approved",
      type: { $in: ["image", "carousel"] },
      mediaUrls: url,
    });

    await AuditLog.create({
      action: "USER_GALLERY_PHOTO_REMOVED",
      user: user._id,
      meta: { url },
    });

    const payload = await clientUserPayload(user.toJSON() as Record<string, unknown>);
    res.json({
      message: "Photo deleted",
      user: payload,
      profileGalleryUrls: nextGallery,
    });
  } catch (err) {
    next(err);
  }
});

// Update content preferences (feed: show products, etc.)
router.patch("/:id/content-preferences", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError("Unauthorized", 403);
    }
    const { showProducts, preferencesAskedAt } = req.body;
    const updates: any = {};
    if (typeof showProducts === "boolean") {
      updates["contentPreferences.showProducts"] = showProducts;
      updates["contentPreferences.preferencesSetAt"] = new Date();
    }
    if (preferencesAskedAt) {
      const d = new Date(preferencesAskedAt);
      if (!isNaN(d.getTime())) updates["contentPreferences.preferencesAskedAt"] = d;
    }
    if (Object.keys(updates).length === 0) {
      const user = await User.findById(req.params.id).select("-passwordHash").lean();
      if (!user) throw new AppError("User not found", 404);
      return res.json({ user, contentPreferences: (user as any).contentPreferences });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);
    res.json({ message: "Content preferences updated", user, contentPreferences: (user as any).contentPreferences });
  } catch (err) {
    next(err);
  }
});

// Go live / end live (toggle isLive)
router.patch("/:id/live", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError("Unauthorized", 403);
    }
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);
    const nextLive = !(user as any).isLive;
    (user as any).isLive = nextLive;
    if (nextLive) {
      (user as any).lastLiveEndedAt = undefined;
      (user as any).liveStartedAt = new Date();
    } else {
      (user as any).liveStreamName = undefined;
      (user as any).liveStartedAt = undefined;
      (user as any).lastLiveEndedAt = new Date();
    }
    await user.save();
    res.json({ message: nextLive ? "You are now live" : "Live ended", isLive: nextLive });
  } catch (err) {
    next(err);
  }
});

// Upload avatar
router.post(
  "/:id/avatar",
  authenticate,
  upload.single("avatar"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const targetId = req.params.id;
      const actorId = req.user!._id.toString();
      if (actorId !== targetId) {
        const targetSchool = await User.findById(targetId)
          .select("schoolPageManagers isSchoolAccount name _id")
          .lean();
        if (!targetSchool || !canEditSchoolProfile(actorId, targetSchool as any)) {
          throw new AppError("Unauthorized", 403);
        }
      }

      if (!req.file) throw new AppError("No file uploaded", 400);
      const avatarFilePath = (req.file as any).path || path.join(__dirname, "../../uploads", req.file.filename);
      const mod = await moderateMedia(avatarFilePath, req.file.mimetype);
      if (!mod.safe || mod.sensitive) {
        try {
          fs.unlinkSync(avatarFilePath);
        } catch {
          /* ignore */
        }
        throw new AppError(
          mod.reason || "Profile image rejected. Nudity or suggestive content is not allowed.",
          400
        );
      }

      const avatarPath = `/uploads/${req.file.filename}`;

      const before = await User.findById(targetId).select("avatar").lean();
      const previousAvatar = (before as { avatar?: string } | null)?.avatar ?? null;

      const user = await User.findByIdAndUpdate(
        targetId,
        { avatar: avatarPath },
        { new: true }
      ).select("-passwordHash");

      if (!user) throw new AppError("User not found", 404);

      await AuditLog.create({
        action: "AVATAR_UPDATED",
        user: user._id,
        meta: { avatar: avatarPath },
      });

      const feed = await publishProfileAvatarFeedUpdate({
        userId: user._id,
        avatarPath,
        previousAvatar,
      });

      res.json({
        message: "Avatar uploaded successfully",
        avatar: avatarPath,
        user: sanitizeUserForClient(user.toJSON() as Record<string, unknown>),
        feedPostId: feed.postId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Set avatar from existing URL (e.g. from wall post image)
router.patch("/:id/avatar-url", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const targetId = req.params.id;
    const actorId = req.user!._id.toString();
    if (actorId !== targetId) {
      const targetSchool = await User.findById(targetId)
        .select("schoolPageManagers isSchoolAccount name _id")
        .lean();
      if (!targetSchool || !canEditSchoolProfile(actorId, targetSchool as any)) {
        throw new AppError("Unauthorized", 403);
      }
    }
    const { url } = req.body;
    if (!url || typeof url !== "string" || !url.trim()) throw new AppError("URL required", 400);
    const avatarUrl = url.trim();
    const before = await User.findById(targetId).select("avatar").lean();
    const previousAvatar = (before as { avatar?: string } | null)?.avatar ?? null;
    const user = await User.findByIdAndUpdate(targetId, { avatar: avatarUrl }, { new: true }).select("-passwordHash");
    if (!user) throw new AppError("User not found", 404);
    await AuditLog.create({ action: "AVATAR_UPDATED", user: user._id, meta: { avatar: avatarUrl } });
    const feed = await publishProfileAvatarFeedUpdate({
      userId: user._id,
      avatarPath: avatarUrl,
      previousAvatar,
    });
    res.json({
      message: "Profile picture updated",
      avatar: avatarUrl,
      user: sanitizeUserForClient(user.toJSON() as Record<string, unknown>),
      feedPostId: feed.postId,
    });
  } catch (err) {
    next(err);
  }
});

// Upload strip background
router.post(
  "/:id/strip-background",
  authenticate,
  upload.single("image"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const targetId = req.params.id;
      const actorId = req.user!._id.toString();
      if (actorId !== targetId) {
        const targetSchool = await User.findById(targetId)
          .select("schoolPageManagers isSchoolAccount name _id")
          .lean();
        if (!targetSchool || !canEditSchoolProfile(actorId, targetSchool as any)) {
          throw new AppError("Unauthorized", 403);
        }
      }
      if (!req.file) throw new AppError("No file uploaded", 400);
      const bgFilePath = (req.file as any).path || path.join(__dirname, "../../uploads", req.file.filename);
      const mod = await moderateMedia(bgFilePath, req.file.mimetype);
      if (!mod.safe || mod.sensitive) {
        try {
          fs.unlinkSync(bgFilePath);
        } catch {
          /* ignore */
        }
        throw new AppError(
          mod.reason || "Image rejected. Nudity or suggestive content is not allowed.",
          400
        );
      }
      const url = `/uploads/${req.file.filename}`;
      const user = await User.findByIdAndUpdate(targetId, { stripBackgroundPic: url }, { new: true }).select("-passwordHash");
      if (!user) throw new AppError("User not found", 404);
      await AuditLog.create({ action: "STRIP_BACKGROUND_UPDATED", user: user._id, meta: { stripBackgroundPic: url } });
      res.json({ message: "Strip background updated", stripBackgroundPic: url, user });
    } catch (err) {
      next(err);
    }
  }
);

// Upload vehicle (runner) - add vehicle with documents (max 3 vehicles per user)
router.post(
  "/:id/vehicles",
  authenticate,
  upload.array("documents", 5),
  async (req: AuthRequest, res: Response, next) => {
    try {
      if (req.user?._id.toString() !== req.params.id) {
        throw new AppError("Unauthorized", 403);
      }

      const user = await User.findById(req.params.id);
      if (!user) throw new AppError("User not found", 404);

      // Only runners should upload vehicles (but allow role addition later)
      if (!user.role.includes('runner')) {
        throw new AppError("Only runners may register vehicles", 403);
      }

      // Ensure max 3 vehicles
      const existing = (user.vehicles || []).length;
      if (existing >= 3) {
        throw new AppError("Maximum of 3 vehicles allowed", 400);
      }

      const { make, model, plate } = req.body;
      const files = (req.files as Express.Multer.File[]) || [];

      const vehicle = {
        make: make || undefined,
        model: model || undefined,
        plate: plate || undefined,
        documents: files.map((f) => ({ filename: f.filename, path: `/uploads/${f.filename}`, uploadedAt: new Date() })),
        verified: false,
      };

      user.vehicles = [...(user.vehicles || []), vehicle] as any;
      await user.save();

      await AuditLog.create({ action: 'VEHICLE_ADDED', user: user._id, meta: { plate, make, model } });

      res.status(201).json({ message: 'Vehicle uploaded successfully', vehicle });
    } catch (err) {
      next(err);
    }
  }
);

// Upload PDP (Professional Driving Permit) for runner
router.post('/:id/pdp', authenticate, upload.single('pdp'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError('Unauthorized', 403);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    if (!req.file) throw new AppError('No file uploaded', 400);

    user.pdp = { filename: req.file.filename, path: `/uploads/${req.file.filename}`, uploadedAt: new Date(), verified: false } as any;
    await user.save();

    await AuditLog.create({ action: 'PDP_UPLOADED', user: user._id, meta: { file: user.pdp?.path || null } });

    res.json({ message: 'PDP uploaded successfully', pdp: user.pdp });
  } catch (err) {
    next(err);
  }
});

// Upload ID/passport for store/parcel runners
router.post('/:id/runner-id-document', authenticate, upload.single('document'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError('Unauthorized', 403);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    if (!user.role.includes('runner')) {
      throw new AppError('Only runners may upload verification documents', 403);
    }
    if (!req.file) throw new AppError('No file uploaded', 400);

    user.runnerIdDocument = {
      filename: req.file.filename,
      path: `/uploads/${req.file.filename}`,
      uploadedAt: new Date(),
      verified: false,
    } as any;
    await user.save();

    await AuditLog.create({ action: 'RUNNER_ID_UPLOADED', user: user._id, meta: { file: user.runnerIdDocument?.path || null } });

    res.json({ message: 'ID document uploaded successfully', runnerIdDocument: user.runnerIdDocument });
  } catch (err) {
    next(err);
  }
});

// Upload proof of residence for store/parcel runners
router.post('/:id/runner-proof-of-residence', authenticate, upload.single('document'), async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError('Unauthorized', 403);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    if (!user.role.includes('runner')) {
      throw new AppError('Only runners may upload verification documents', 403);
    }
    if (!req.file) throw new AppError('No file uploaded', 400);

    user.runnerProofOfResidence = {
      filename: req.file.filename,
      path: `/uploads/${req.file.filename}`,
      uploadedAt: new Date(),
      verified: false,
    } as any;
    await user.save();

    await AuditLog.create({
      action: 'RUNNER_PROOF_OF_RESIDENCE_UPLOADED',
      user: user._id,
      meta: { file: user.runnerProofOfResidence?.path || null },
    });

    res.json({ message: 'Proof of residence uploaded successfully', runnerProofOfResidence: user.runnerProofOfResidence });
  } catch (err) {
    next(err);
  }
});

// Update runner location (geotracking) - runner posts their coordinates
router.patch('/:id/location', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError('Unauthorized', 403);
    }

    const { latitude, longitude } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new AppError('Invalid coordinates', 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    user.location = { type: 'Point', coordinates: [longitude, latitude], updatedAt: new Date() } as any;
    await user.save();

    // Emit location update over Socket.IO to clients of assigned tasks
    try {
      await emitRunnerLocation(user._id.toString(), user.location as any);
    } catch (emitErr) {
      // non-fatal - continue
    }

    await AuditLog.create({ action: 'LOCATION_UPDATED', user: user._id, meta: { latitude, longitude } });

    res.json({ message: 'Location updated', location: user.location });
  } catch (err) {
    next(err);
  }
});

// Delete user account
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const isAdmin = (r: any) => Array.isArray(r) ? r.includes('admin') : r === 'admin';
    if (req.user?._id.toString() !== req.params.id && !isAdmin(req.user?.role)) {
      throw new AppError("Unauthorized", 403);
    }

    const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });

    if (!user) throw new AppError("User not found", 404);

    await AuditLog.create({
      action: "USER_DELETED",
      user: user._id,
      meta: { deletedBy: req.user?._id },
    });

    res.json({ message: "User account deactivated successfully" });
  } catch (err) {
    next(err);
  }
});

// List users (with pagination and search) - MacGyver super search: 1-char ok, relevance sorted
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, q } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = { active: true };
    if (req.query.role) query.role = { $in: [req.query.role] };
    const search = (q as string)?.trim();
    if (search && search.length >= 1) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Relevance sort: name/username starting with search first, then contains (MacGyver super search)
    const searchLower = search?.toLowerCase() || "";
    const searchLen = searchLower.length;
    const sortStages =
      searchLen >= 1
        ? [
            {
              $addFields: {
                _relevance: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $or: [
                            { $eq: [{ $toLower: { $substrCP: [{ $ifNull: ["$name", ""] }, 0, searchLen] } }, searchLower] },
                            { $eq: [{ $toLower: { $substrCP: [{ $ifNull: ["$username", ""] }, 0, searchLen] } }, searchLower] },
                          ],
                        },
                        then: 2,
                      },
                      {
                        case: {
                          $or: [
                            { $gt: [{ $indexOfCP: [{ $toLower: { $ifNull: ["$name", ""] } }, searchLower] }, -1] },
                            { $gt: [{ $indexOfCP: [{ $toLower: { $ifNull: ["$username", ""] } }, searchLower] }, -1] },
                          ],
                        },
                        then: 1,
                      },
                    ],
                    default: 0,
                  },
                },
              },
            },
            { $sort: { _relevance: -1 as 1 | -1, name: 1 as 1 | -1 } },
            { $project: { _relevance: 0 } },
          ]
        : [];

    const baseQuery = User.find(query).select("-passwordHash");
    const [users, total] = await Promise.all([
      sortStages.length > 0
        ? User.aggregate([
            { $match: query },
            { $project: { passwordHash: 0 } },
            ...sortStages,
            { $skip: skip },
            { $limit: limitNum },
          ])
        : baseQuery.skip(skip).limit(limitNum).lean(),
      User.countDocuments(query),
    ]);

    const clientUsers = await sanitizeUsersForClientView(
      await Promise.all(
        (Array.isArray(users) ? users : []).map((u) => clientUserPayload(u as Record<string, unknown>))
      ),
      req.user!._id.toString()
    );

    res.json({
      users: clientUsers,
      pagination: {
        total,
        page: Math.floor(skip / limitNum) + 1,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Add or remove roles for current user
router.post("/:id/roles", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.user?._id.toString() !== req.params.id) {
      throw new AppError("Unauthorized", 403);
    }

    const { action, role } = req.body; // action: 'add' or 'remove', role: 'client' or 'runner'

    if (!['add', 'remove'].includes(action)) {
      throw new AppError("Invalid action. Use 'add' or 'remove'", 400);
    }

    if (!['client', 'runner'].includes(role)) {
      throw new AppError("Invalid role. Use 'client' or 'runner'", 400);
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);

    if (action === 'add') {
      // Add role if not already present
      if (!user.role.includes(role as any)) {
        user.role.push(role as any);
      }
    } else {
      // Remove role, but ensure at least one role remains
      if (user.role.length > 1) {
        user.role = user.role.filter(r => r !== role) as any;
      } else {
        throw new AppError("Cannot remove last role. User must have at least one role", 400);
      }
    }

    await user.save();

    await AuditLog.create({
      action: "USER_ROLE_UPDATED",
      user: user._id,
      meta: { action, role, newRoles: user.role },
    });

    res.json({ 
      message: `Role ${action === 'add' ? 'added' : 'removed'} successfully`, 
      roles: user.role 
    });
  } catch (err) {
    next(err);
  }
});

export default router;
