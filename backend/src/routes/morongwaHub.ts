import crypto from "crypto";
import express, { Response } from "express";
import path from "path";
import fs from "fs";
import MorongwaContact from "../data/models/MorongwaContact";
import MorongwaMeeting from "../data/models/MorongwaMeeting";
import MorongwaUserFile from "../data/models/MorongwaUserFile";
import User from "../data/models/User";
import DirectMessage from "../data/models/DirectMessage";
import { authenticate, AuthRequest } from "../middleware/auth";
import { uploadMorongwaLarge } from "../middleware/uploadMorongwaLarge";
import { AppError } from "../middleware/errorHandler";
import { sendNotification } from "../services/notification";
import { emitMeetingInvite } from "../services/webrtcSignaling";
import { pushMessengerSyncEvent } from "../services/messengerSyncBridge";

const router = express.Router();

function generateMeetingId(): string {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function normalizePhoneDigits(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

function publicJoinUrl(meetingId: string): string {
  const base = String(process.env.FRONTEND_URL || "https://www.qwertymates.com").replace(/\/$/, "");
  return `${base}/messages?section=meet&join=${encodeURIComponent(meetingId)}`;
}

/** Accept meeting ID or room id (`meeting-abc123` → `ABC123`). */
function normalizeMeetingIdInput(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("meeting-")) {
    return s.slice(8).toUpperCase();
  }
  return s.toUpperCase();
}

async function findMeetingByIdOrRoom(raw: string) {
  const meetingId = normalizeMeetingIdInput(raw);
  if (!meetingId) return null;
  return MorongwaMeeting.findOne({
    $or: [
      { meetingId },
      { roomId: raw.trim() },
      { roomId: `meeting-${meetingId.toLowerCase()}` },
    ],
  })
    .populate("hostId", "name username")
    .lean();
}

// ——— Contacts ———

router.get("/contacts", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const ownerId = req.user!._id;
    const contacts = await MorongwaContact.find({ ownerId })
      .populate("platformUserId", "name username avatar phone")
      .sort({ name: 1 })
      .lean();
    res.json({ data: contacts });
  } catch (err) {
    next(err);
  }
});

router.post("/contacts", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const ownerId = req.user!._id;
    const name = String(req.body?.name || "").trim();
    const phone = normalizePhoneDigits(String(req.body?.phone || ""));
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!name) throw new AppError("Name is required", 400);

    let platformUserId = req.body?.platformUserId;
    if (!platformUserId && phone) {
      const match = await User.findOne({ phone }).select("_id").lean();
      if (match) platformUserId = match._id;
    }

    const contact = await MorongwaContact.create({
      ownerId,
      name,
      phone: phone || undefined,
      email: email || undefined,
      platformUserId: platformUserId || undefined,
      source: req.body?.source === "phone" ? "phone" : "manual",
    });
    res.status(201).json({ data: contact });
  } catch (err) {
    next(err);
  }
});

router.post("/contacts/import", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const ownerId = req.user!._id;
    const rows = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
    if (!rows.length) throw new AppError("No contacts to import", 400);

    const created: unknown[] = [];
    for (const row of rows.slice(0, 500)) {
      const name = String(row?.name || "").trim();
      if (!name) continue;
      const phone = normalizePhoneDigits(String(row?.phone || ""));
      const email = String(row?.email || "").trim().toLowerCase();
      let platformUserId = row?.platformUserId;
      if (!platformUserId && phone) {
        const match = await User.findOne({ phone }).select("_id").lean();
        if (match) platformUserId = match._id;
      }
      const doc = await MorongwaContact.create({
        ownerId,
        name,
        phone: phone || undefined,
        email: email || undefined,
        platformUserId: platformUserId || undefined,
        source: row?.source === "phone" ? "phone" : "csv",
      });
      created.push(doc);
    }
    res.status(201).json({ imported: created.length, data: created });
  } catch (err) {
    next(err);
  }
});

router.delete("/contacts/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const ownerId = req.user!._id;
    const result = await MorongwaContact.findOneAndDelete({ _id: req.params.id, ownerId });
    if (!result) throw new AppError("Contact not found", 404);
    res.json({ message: "Contact deleted" });
  } catch (err) {
    next(err);
  }
});

// ——— Meetings ———

router.get("/meetings", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const hostId = req.user!._id;
    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 90 * 86400000);
    const meetings = await MorongwaMeeting.find({
      hostId,
      $or: [
        { scheduledStart: { $gte: from, $lte: to } },
        { kind: "instant", createdAt: { $gte: from } },
      ],
    })
      .sort({ scheduledStart: 1, createdAt: -1 })
      .lean();
    res.json({ data: meetings });
  } catch (err) {
    next(err);
  }
});

router.post("/meetings/instant", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const hostId = req.user!._id;
    const title = String(req.body?.title || "Morongwa meeting").trim() || "Morongwa meeting";
    const passcode = String(req.body?.passcode || "").trim() || undefined;
    let meetingId = generateMeetingId();
    for (let i = 0; i < 5; i++) {
      const exists = await MorongwaMeeting.findOne({ meetingId }).lean();
      if (!exists) break;
      meetingId = generateMeetingId();
    }
    const roomId = `meeting-${meetingId.toLowerCase()}`;
    const meeting = await MorongwaMeeting.create({
      hostId,
      meetingId,
      title,
      passcode,
      roomId,
      kind: "instant",
    });
    res.status(201).json({
      data: meeting,
      joinUrl: publicJoinUrl(meetingId),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/meetings/schedule", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const hostId = req.user!._id;
    const title = String(req.body?.title || "Scheduled meeting").trim() || "Scheduled meeting";
    const passcode = String(req.body?.passcode || "").trim() || undefined;
    const scheduledStart = new Date(String(req.body?.scheduledStart || ""));
    const scheduledEnd = new Date(String(req.body?.scheduledEnd || ""));
    if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) {
      throw new AppError("Valid scheduledStart and scheduledEnd are required", 400);
    }
    let meetingId = generateMeetingId();
    const roomId = `meeting-${meetingId.toLowerCase()}`;
    const meeting = await MorongwaMeeting.create({
      hostId,
      meetingId,
      title,
      passcode,
      scheduledStart,
      scheduledEnd,
      roomId,
      kind: "scheduled",
    });
    res.status(201).json({
      data: meeting,
      joinUrl: publicJoinUrl(meetingId),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/meetings/join", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const raw = String(req.body?.meetingId || "").trim();
    const passcode = String(req.body?.passcode || "").trim();
    if (!raw) throw new AppError("Meeting ID is required", 400);

    const meeting = await findMeetingByIdOrRoom(raw);
    if (!meeting) throw new AppError("Meeting not found", 404);
    if (meeting.passcode && meeting.passcode !== passcode) {
      throw new AppError("Incorrect meeting passcode", 403);
    }

    const host = meeting.hostId as { _id?: unknown; name?: string; username?: string } | null;
    res.json({
      data: {
        meetingId: meeting.meetingId,
        title: meeting.title,
        roomId: meeting.roomId,
        hostUserId: String(host?._id || meeting.hostId),
        hostName: host?.name || host?.username || "Host",
        scheduledStart: meeting.scheduledStart,
        scheduledEnd: meeting.scheduledEnd,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/meetings/invite", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const senderId = req.user!._id.toString();
    const rawMeetingId = String(req.body?.meetingId || "").trim();
    const recipientUserIds: string[] = Array.isArray(req.body?.recipientUserIds)
      ? req.body.recipientUserIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];
    if (!rawMeetingId) throw new AppError("Meeting ID is required", 400);
    if (!recipientUserIds.length) throw new AppError("Select at least one user to invite", 400);

    const meeting = await findMeetingByIdOrRoom(rawMeetingId);
    if (!meeting) throw new AppError("Meeting not found", 404);

    const host = meeting.hostId as { _id?: unknown; name?: string; username?: string } | null;
    const hostName = host?.name || host?.username || "Someone";
    const joinUrl = publicJoinUrl(meeting.meetingId);
    const inviteText = `${hostName} invited you to "${meeting.title}" on Qwertymates.\nMeeting ID: ${meeting.meetingId}\nJoin: ${joinUrl}`;

    const sent: string[] = [];
    const uniqueIds = [...new Set(recipientUserIds)].slice(0, 50);

    for (const recipientId of uniqueIds) {
      if (recipientId === senderId) continue;
      const recipient = await User.findById(recipientId).select("_id name").lean();
      if (!recipient) continue;
      const receiverId = String(recipient._id);

      const message = await DirectMessage.create({
        sender: senderId,
        receiver: receiverId,
        content: inviteText.substring(0, 1000),
      });
      pushMessengerSyncEvent("message.created", senderId, {
        conversationType: "direct",
        conversationId: `direct-${recipientId}`,
        messageId: message._id.toString(),
        senderUserId: senderId,
        receiverUserId: recipientId,
        body: message.content,
        createdAt: message.createdAt.toISOString(),
      });

      await sendNotification({
        userId: recipientId,
        type: "meeting_invite",
        message: `${hostName} invited you to "${meeting.title}". Tap to join.`,
        channel: "realtime",
      });

      emitMeetingInvite(recipientId, {
        meetingId: meeting.meetingId,
        title: meeting.title,
        roomId: meeting.roomId,
        hostUserId: String(host?._id || meeting.hostId),
        hostName,
        joinUrl,
      });

      sent.push(recipientId);
    }

    if (!sent.length) throw new AppError("No valid recipients", 400);

    res.json({ sent: sent.length, recipientUserIds: sent, joinUrl });
  } catch (err) {
    next(err);
  }
});

// ——— Files ———

router.get("/files", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const uid = req.user!._id;
    const files = await MorongwaUserFile.find({
      $or: [{ senderId: uid }, { recipientId: uid }],
    })
      .populate("senderId", "name username avatar")
      .populate("recipientId", "name username avatar")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ data: files });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/files",
  authenticate,
  uploadMorongwaLarge.single("file"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const senderId = req.user!._id;
      const recipientId = String(req.body?.recipientUserId || "").trim();
      if (!recipientId) throw new AppError("recipientUserId is required", 400);
      if (!req.file) throw new AppError("No file uploaded", 400);

      const recipient = await User.findById(recipientId).select("_id").lean();
      if (!recipient) throw new AppError("Recipient not found", 404);

      const doc = await MorongwaUserFile.create({
        senderId,
        recipientId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      res.status(201).json({ data: doc, message: "File sent" });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/files/:id/download", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const uid = req.user!._id.toString();
    const file = await MorongwaUserFile.findById(req.params.id);
    if (!file) throw new AppError("File not found", 404);
    if (file.senderId.toString() !== uid && file.recipientId.toString() !== uid) {
      throw new AppError("Unauthorized", 403);
    }
    if (!fs.existsSync(file.path)) throw new AppError("File missing on server", 410);

    if (file.recipientId.toString() === uid) {
      file.downloadedAt = new Date();
      await file.save();
    }

    res.download(path.resolve(file.path), file.originalName);
  } catch (err) {
    next(err);
  }
});

router.delete("/files/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const uid = req.user!._id.toString();
    const file = await MorongwaUserFile.findById(req.params.id);
    if (!file) throw new AppError("File not found", 404);
    if (file.senderId.toString() !== uid) throw new AppError("Unauthorized", 403);
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    await file.deleteOne();
    res.json({ message: "File deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
