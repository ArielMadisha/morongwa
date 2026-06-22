// Task management routes
import express, { Response } from "express";
import Task from "../data/models/Task";
import Wallet from "../data/models/Wallet";
import Escrow from "../data/models/Escrow";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { taskSchema } from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { notifyPlatformAdminsRealtime, sendNotification } from "../services/notification";
import User from "../data/models/User";
import { calculateDistance } from "../utils/helpers";
import { PRICING_CONFIG, DEFAULT_COMMISSION_RATE } from "../config/fees.config";
import { findMatchingRunners } from "../services/matching";
import { calculateQuote } from "../services/pricing";
import errandsTshwaneRoutes from "./errandsTshwane";

const router = express.Router();

router.use("/tshwane", errandsTshwaneRoutes);

function requiresErrandHandoverV2(task: { workflowMeta?: Record<string, unknown> } | null): boolean {
  return Boolean(task?.workflowMeta && (task.workflowMeta as any).errandHandoverV2 === true);
}

// Create a new task
router.post(
  "/",
  authenticate,
  authorize("client"),
  upload.fields([
    { name: "attachments", maxCount: 5 },
    { name: "supplierInvoice", maxCount: 1 },
  ]),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { error } = taskSchema.validate(req.body);
      if (error) throw new AppError(error.details[0].message, 400);

      const { title, description, location, pickupLocation, deliveryLocation, taskType } = req.body;

      const fileMap = (req.files || {}) as Record<string, Express.Multer.File[]>;
      const attachmentFiles = fileMap.attachments || [];
      const invoiceFile = fileMap.supplierInvoice?.[0];

      const attachments = attachmentFiles.map((file) => ({
        filename: file.filename,
        path: `/uploads/${file.filename}`,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      }));
      const supplierInvoice = invoiceFile
        ? {
            filename: invoiceFile.filename,
            path: `/uploads/${invoiceFile.filename}`,
            mimetype: invoiceFile.mimetype,
            size: invoiceFile.size,
            uploadedAt: new Date(),
          }
        : null;

      // Handle location - accept both string and GeoJSON object
      // Parse pickup and delivery locations if passed as strings
      const parseLoc = (val: any) => {
        if (!val) return null;
        if (typeof val === 'string') {
          try {
            return JSON.parse(val);
          } catch {
            return { type: 'Point', coordinates: [0, 0], address: val };
          }
        }
        return val;
      };

      const pickup = parseLoc(pickupLocation) || parseLoc(location);
      const delivery = parseLoc(deliveryLocation) || null;
      const parsedParcelRaw = parseLoc(req.body.parcelDetails);
      const parsedWorkflowMeta = parseLoc(req.body.workflowMeta);
      const parcelInput =
        parsedParcelRaw && typeof parsedParcelRaw === "object" ? parsedParcelRaw : {};
      const toNum = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const parcelLengthCm = toNum(parcelInput.lengthCm);
      const parcelWidthCm = toNum(parcelInput.widthCm);
      const parcelHeightCm = toNum(parcelInput.heightCm);
      const parcelWeightKg = toNum(parcelInput.weightKg);
      const volumetricWeightKg =
        parcelLengthCm && parcelWidthCm && parcelHeightCm
          ? Math.round(((parcelLengthCm * parcelWidthCm * parcelHeightCm) / 5000) * 100) / 100
          : undefined;
      const chargeableWeightKg = Math.max(parcelWeightKg || 0, volumetricWeightKg || 0) || undefined;
      const parcelDetails =
        parcelLengthCm || parcelWidthCm || parcelHeightCm || parcelWeightKg
          ? {
              lengthCm: parcelLengthCm,
              widthCm: parcelWidthCm,
              heightCm: parcelHeightCm,
              weightKg: parcelWeightKg,
              volumetricWeightKg,
              chargeableWeightKg,
            }
          : undefined;

      let estimatedDistanceKm: number | undefined = undefined;
      let suggestedFee: number | undefined = undefined;
      let quote: ReturnType<typeof calculateQuote> | null = null;
      const workflowMetaRaw =
        parsedWorkflowMeta && typeof parsedWorkflowMeta === "object" ? parsedWorkflowMeta : {};
      const workflowMeta = {
        ...(workflowMetaRaw as Record<string, unknown>),
        errandHandoverV2: true,
        createdVia: (workflowMetaRaw as any)?.createdVia || "web",
      };
      const normalizedTaskType =
        typeof taskType === "string"
          ? taskType === "collect_send"
            ? "cross_border_collection"
            : taskType === "shop_send"
            ? "shop_and_send"
            : taskType === "transport"
            ? "large_transport"
            : taskType
          : "general";

      // Use ZAR pricing config by default
      const pricing = PRICING_CONFIG.ZAR;
      if (pickup && delivery && pickup.coordinates && delivery.coordinates) {
        const dist = calculateDistance([pickup.coordinates[0], pickup.coordinates[1]], [delivery.coordinates[0], delivery.coordinates[1]]);
        estimatedDistanceKm = Math.round(dist * 100) / 100; // two decimals

        quote = calculateQuote({
          currency: "ZAR",
          taskType: normalizedTaskType as any,
          deliveryMethod: (workflowMeta as any)?.deliveryType || (workflowMeta as any)?.deliveryMethod,
          itemType: (workflowMeta as any)?.itemType,
          vehicleType: (workflowMeta as any)?.vehicleType,
          urgency: (workflowMeta as any)?.urgency === "urgent" ? "urgent" : "normal",
          itemCount: Number((workflowMeta as any)?.itemCount || 1),
          waitingRequired: Boolean((workflowMeta as any)?.waitingRequired),
          locationZone: (workflowMeta as any)?.locationZone,
          distanceKm: estimatedDistanceKm,
          weightKg: chargeableWeightKg || undefined,
          actualWeightKg: parcelWeightKg || 0,
          lengthCm: parcelLengthCm || 0,
          widthCm: parcelWidthCm || 0,
          heightCm: parcelHeightCm || 0,
          isPeak: false,
          isUrgent: (workflowMeta as any)?.urgency === "urgent",
        });
        suggestedFee = quote.totalClientPrice;
      }

      if (normalizedTaskType !== "general" && !estimatedDistanceKm) {
        throw new AppError("Distance must be available before creating this task.", 400);
      }
      if (!quote && estimatedDistanceKm != null) {
        throw new AppError("Pricing could not be calculated. Please retry.", 400);
      }

      const calculatedTaskPrice = quote?.taskPrice || 0;
      const totalClientPrice = quote?.totalClientPrice || calculatedTaskPrice || 0;
      const budgetValue = calculatedTaskPrice;
      if (!budgetValue || !totalClientPrice) {
        throw new AppError("Missing pricing fields. Please calculate pricing before creating task.", 400);
      }

      // Ensure client wallet has sufficient balance and hold funds into escrow at creation time
      let clientWallet = await Wallet.findOne({ user: req.user!._id });
      if (!clientWallet) clientWallet = await Wallet.create({ user: req.user!._id });
      if (totalClientPrice > 0 && clientWallet.balance < totalClientPrice) {
        return res.status(400).json({
          code: "INSUFFICIENT_FUNDS",
          message: "Insufficient funds to create task. Please top up your wallet.",
          balance: clientWallet.balance,
          requiredAmount: Math.max(0, Math.ceil(totalClientPrice - clientWallet.balance)),
        });
      }

      const task = await Task.create({
        taskType: typeof taskType === "string" ? taskType : undefined,
        title,
        description,
        workflowMeta,
        budget: budgetValue,
        pickupLocation: pickup,
        deliveryLocation: delivery,
        estimatedDistanceKm,
        suggestedFee: totalClientPrice || suggestedFee,
        parcelDetails,
        supplierInvoice,
        client: req.user!._id,
        attachments: attachments || [],
        escrowed: false,
      });

      await AuditLog.create({
        action: "TASK_CREATED",
        user: req.user!._id,
        target: task._id,
        meta: { title, budget: budgetValue },
      });

      // Escrow hold: deduct from client wallet now and create escrow record
      if (totalClientPrice > 0) {
        // Deduct from client wallet
        clientWallet.balance -= totalClientPrice;
        clientWallet.transactions.push({
          type: "escrow",
          amount: -totalClientPrice,
          reference: task._id.toString(),
          createdAt: new Date(),
        });
        await clientWallet.save();

        const commission = quote?.platformFee ?? Math.round(budgetValue * pricing.commissionPct * 100) / 100;
        const runnersNet = quote?.runnerPayout ?? Math.max(0, Math.round((budgetValue - commission) * 100) / 100);

        await Escrow.create({
          task: task._id,
          client: req.user!._id,
          runner: task.runner || undefined,
          currency: "ZAR",
          taskPrice: budgetValue,
          fees: {
            bookingFee: quote?.bookingFee ?? pricing.bookingFeeLocal,
            commission,
            distanceSurcharge: quote?.distanceSurcharge ?? 0,
            peakSurcharge: quote?.peakSurcharge ?? 0,
            weightSurcharge: quote?.complexityFee ?? 0,
            urgencySurcharge: quote?.urgencySurcharge ?? 0,
            total: (quote?.platformFee ?? commission) + (quote?.bookingFee ?? pricing.bookingFeeLocal),
          },
          totalHeld: totalClientPrice,
          runnersNet,
          status: "held",
          paymentStatus: "settled",
        });

        task.escrowed = true;
        await task.save();
      }

      // Notify matching runners
      const matches = await findMatchingRunners(task._id.toString());
      for (const match of matches.slice(0, 5)) {
        await sendNotification({
          userId: match.runnerId,
          type: "NEW_TASK",
          message: `New task available: ${title} — est. ${task.suggestedFee || task.budget} ZAR (${task.estimatedDistanceKm || 0} km)` ,
        });
      }

      res.status(201).json({ message: "Task created successfully", task });
    } catch (err) {
      next(err);
    }
  }
);

// Get available tasks (for runners)
router.get("/available", authenticate, authorize("runner"), async (req: AuthRequest, res: Response, next) => {
  try {
    const tasks = await Task.find({ status: "posted" })
      .populate("client", "name email")
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// Get my tasks (tasks created by current user if client, or assigned to them if runner)
router.get("/my-tasks", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const isClient = Array.isArray(req.user!.role) ? req.user!.role.includes('client') : req.user!.role === 'client';
    const query = isClient
      ? { client: req.user!._id }
      : { runner: req.user!._id };
    
    const tasks = await Task.find(query)
      .populate("client", "name email")
      .populate("runner", "name email")
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// Get my accepted tasks (for runners)
router.get("/my-accepted", authenticate, authorize("runner"), async (req: AuthRequest, res: Response, next) => {
  try {
    const tasks = await Task.find({ 
      runner: req.user!._id,
      status: { $in: ["accepted", "in_progress"] }
    })
      .populate("client", "name email")
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// Get all tasks (with filters and pagination)
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status, client, runner } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = {};
    if (status) query.status = status;
    if (client) query.client = client;
    if (runner) query.runner = runner;

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("client", "name email")
        .populate("runner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Task.countDocuments(query),
    ]);

    res.json({
      tasks,
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

// Get task by ID
router.get("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("client", "name email avatar")
      .populate("runner", "name email avatar");

    if (!task) throw new AppError("Task not found", 404);

    res.json({ task, commissionRate: DEFAULT_COMMISSION_RATE });
  } catch (err) {
    next(err);
  }
});

// Get escrow details for a task
router.get("/:id/escrow", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError("Task not found", 404);

    // Only client or assigned runner may view escrow
    const isClient = task.client.toString() === req.user!._id.toString();
    const isRunner = task.runner?.toString() === req.user!._id.toString();
    if (!isClient && !isRunner) {
      throw new AppError("Unauthorized", 403);
    }

    const escrow = await Escrow.findOne({ task: task._id });
    if (!escrow) return res.status(404).json({ error: "Escrow not found" });
    res.json({ escrow, commissionRate: DEFAULT_COMMISSION_RATE });
  } catch (err) {
    next(err);
  }
});

// Runner uploads parcel photo after pickup (web handover v2)
router.post(
  "/:id/pickup-proof",
  authenticate,
  authorize("runner"),
  upload.single("photo"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) throw new AppError("Task not found", 404);
      if (!requiresErrandHandoverV2(task)) {
        throw new AppError("Pickup proof is only used for web errands with handover tracking.", 400);
      }
      if (task.runner?.toString() !== req.user!._id.toString()) {
        throw new AppError("Unauthorized", 403);
      }
      if (!["accepted", "in_progress"].includes(task.status)) {
        throw new AppError("Task must be accepted or in progress to upload pickup proof", 400);
      }
      const file = req.file;
      if (!file) throw new AppError("Photo file required (field: photo)", 400);

      const proof = {
        filename: file.filename,
        path: `/uploads/${file.filename}`,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      };
      const wm = { ...(task.workflowMeta || {}) };
      wm.pickupProof = proof;
      task.workflowMeta = wm;
      await task.save();

      await AuditLog.create({
        action: "TASK_PICKUP_PROOF_UPLOADED",
        user: req.user!._id,
        target: task._id,
        meta: { path: proof.path },
      });

      await sendNotification({
        userId: task.client.toString(),
        type: "TASK_PICKUP_PROOF",
        message: `Runner uploaded a pickup photo for "${task.title}".`,
        channel: "realtime",
      });

      res.json({ message: "Pickup photo saved", task });
    } catch (err) {
      next(err);
    }
  }
);

// Runner rings arrival bell — shares GPS with admins (web handover v2)
router.post(
  "/:id/arrival-bell",
  authenticate,
  authorize("runner"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const lat = Number(req.body?.lat ?? req.body?.latitude);
      const lng = Number(req.body?.lng ?? req.body?.lon ?? req.body?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new AppError("Valid lat and lng (or lon) are required", 400);
      }
      const accuracyM =
        req.body?.accuracyM != null ? Number(req.body.accuracyM) : req.body?.accuracy != null ? Number(req.body.accuracy) : undefined;

      const task = await Task.findById(req.params.id);
      if (!task) throw new AppError("Task not found", 404);
      if (!requiresErrandHandoverV2(task)) {
        throw new AppError("Arrival bell is only used for web errands with handover tracking.", 400);
      }
      if (task.runner?.toString() !== req.user!._id.toString()) {
        throw new AppError("Unauthorized", 403);
      }
      if (task.status !== "in_progress") {
        throw new AppError("Start the errand before ringing the arrival bell.", 400);
      }

      const runnerDoc = await User.findById(req.user!._id).select("name").lean();
      const runnerName = String(runnerDoc?.name || "Runner").trim() || "Runner";
      const event = {
        lat,
        lng,
        at: new Date().toISOString(),
        ...(Number.isFinite(accuracyM as number) ? { accuracyM } : {}),
      };
      const wm = { ...(task.workflowMeta || {}) };
      const bells = Array.isArray(wm.arrivalBells) ? [...wm.arrivalBells] : [];
      bells.push(event);
      wm.arrivalBells = bells;
      task.workflowMeta = wm;
      await task.save();

      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      const taskTail = String(task._id).slice(-6);
      await notifyPlatformAdminsRealtime({
        type: "ERRAND_ARRIVAL_BELL",
        message: `🔔 ${runnerName} rang arrival bell · Task #${taskTail} · ${mapsUrl}`,
      });

      await sendNotification({
        userId: task.client.toString(),
        type: "RUNNER_ARRIVAL_BELL",
        message: `${runnerName} is at drop-off for "${task.title}".`,
        channel: "realtime",
      });

      await AuditLog.create({
        action: "TASK_ARRIVAL_BELL",
        user: req.user!._id,
        target: task._id,
        meta: { lat, lng },
      });

      res.json({ message: "Arrival bell sent to admins", mapsUrl, task });
    } catch (err) {
      next(err);
    }
  }
);

// Client confirms they collected the parcel (before runner closes task — web handover v2)
router.post("/:id/confirm-collection", authenticate, authorize("client"), async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError("Task not found", 404);
    if (!requiresErrandHandoverV2(task)) {
      throw new AppError("This task does not use the collection confirmation step.", 400);
    }
    if (task.client.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }
    if (task.status !== "in_progress") {
      throw new AppError("Collection can only be confirmed while the runner is on the way or at delivery.", 400);
    }
    const wm = { ...(task.workflowMeta || {}) };
    if (wm.clientCollectedAt) {
      return res.json({ message: "Collection already confirmed", task });
    }
    wm.clientCollectedAt = new Date().toISOString();
    task.workflowMeta = wm;
    await task.save();

    await AuditLog.create({
      action: "TASK_CLIENT_COLLECTION_CONFIRMED",
      user: req.user!._id,
      target: task._id,
      meta: {},
    });

    if (task.runner) {
      await sendNotification({
        userId: task.runner.toString(),
        type: "TASK_CLIENT_COLLECTED",
        message: `The client confirmed parcel collection for "${task.title}". You can close the task when ready.`,
        channel: "realtime",
      });
    }

    res.json({ message: "Collection confirmed", task });
  } catch (err) {
    next(err);
  }
});

// Accept a task (runner)
router.post(
  "/:id/accept",
  authenticate,
  authorize("runner"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) throw new AppError("Task not found", 404);

      if (task.status !== "posted") {
        throw new AppError("Task is not available", 400);
      }

      // Ensure runner has no active or unclosed completed tasks
      const activeTask = await Task.findOne({ runner: req.user!._id, status: { $in: ["accepted", "in_progress"] } });
      if (activeTask) {
        throw new AppError("You have an active task. Close it before accepting a new one.", 400);
      }

      const unclosed = await Task.findOne({ runner: req.user!._id, status: "completed", closedAtDestination: { $ne: true } });
      if (unclosed) {
        throw new AppError("Please confirm delivery at the destination for your last task before accepting a new one.", 400);
      }

      task.status = "accepted";
      task.runner = req.user!._id;
      // escrow already held on creation
      task.acceptedAt = new Date();
      await task.save();

      await AuditLog.create({
        action: "TASK_ACCEPTED",
        user: req.user!._id,
        target: task._id,
        meta: { taskId: task._id, budget: task.budget },
      });

      await sendNotification({
        userId: task.client.toString(),
        type: "TASK_ACCEPTED",
        message: `Your task "${task.title}" has been accepted`,
        channel: "email",
        email: {
          subject: "Task Accepted",
          html: `<p>Your task "<strong>${task.title}</strong>" has been accepted by a runner.</p>`,
        },
      });

      res.json({ message: "Task accepted successfully", task });
    } catch (err) {
      next(err);
    }
  }
);

// Start a task (runner begins the errand)
router.post(
  "/:id/start",
  authenticate,
  authorize("runner"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) throw new AppError("Task not found", 404);

      if (task.runner?.toString() !== req.user!._id.toString()) {
        throw new AppError("Unauthorized", 403);
      }

      if (task.status !== "accepted") {
        throw new AppError("Task must be in accepted state to start", 400);
      }

      task.status = "in_progress";
      task.startedAt = new Date();
      await task.save();

      await AuditLog.create({
        action: "TASK_STARTED",
        user: req.user!._id,
        target: task._id,
        meta: { taskId: task._id },
      });

      await sendNotification({
        userId: task.client.toString(),
        type: "TASK_STARTED",
        message: `Runner has started your errand: "${task.title}"`,
        channel: "realtime",
      });

      res.json({ message: "Task started successfully", task });
    } catch (err) {
      next(err);
    }
  }
);

// Check if runner is at destination and update accordingly
router.post(
  "/:id/check-arrival",
  authenticate,
  authorize("runner"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { lat, lon } = req.body;
      if (!lat || !lon) throw new AppError("Location coordinates required", 400);

      const task = await Task.findById(req.params.id);
      if (!task) throw new AppError("Task not found", 404);

      if (task.runner?.toString() !== req.user!._id.toString()) {
        throw new AppError("Unauthorized", 403);
      }

      if (task.status !== "in_progress") {
        throw new AppError("Task is not in progress", 400);
      }

      // Check if there's a delivery location
      if (!task.deliveryLocation || !task.deliveryLocation.coordinates) {
        return res.json({ atDestination: false, message: "No delivery location set" });
      }

      // Calculate distance to destination
      const destLon = task.deliveryLocation.coordinates[0];
      const destLat = task.deliveryLocation.coordinates[1];
      const distance = calculateDistance([parseFloat(lon), parseFloat(lat)], [destLon, destLat]);

      // If within 100 meters (0.1 km), mark as arrived
      const ARRIVAL_THRESHOLD_KM = 0.1;
      if (distance <= ARRIVAL_THRESHOLD_KM) {
        await sendNotification({
          userId: task.client.toString(),
          type: "RUNNER_ARRIVED",
          message: `Runner has arrived at the destination for: "${task.title}"`,
          channel: "realtime",
        });

        res.json({ 
          atDestination: true, 
          distance, 
          message: "You have arrived at the destination. Please complete the task." 
        });
      } else {
        res.json({ 
          atDestination: false, 
          distance, 
          message: `${(distance * 1000).toFixed(0)}m to destination` 
        });
      }
    } catch (err) {
      next(err);
    }
  }
);

// Complete a task (runner)
router.post(
  "/:id/complete",
  authenticate,
  authorize("runner"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const task = await Task.findById(req.params.id);
      if (!task) throw new AppError("Task not found", 404);

      if (task.runner?.toString() !== req.user!._id.toString()) {
        throw new AppError("Unauthorized", 403);
      }

      const v2 = requiresErrandHandoverV2(task);
      if (v2) {
        if (task.status !== "in_progress") {
          throw new AppError("Start the errand before closing the task.", 400);
        }
        const wm = { ...(task.workflowMeta || {}) };
        if (!(wm as any).pickupProof?.path) {
          throw new AppError("Upload a pickup photo before closing the task.", 400);
        }
        const bells = Array.isArray((wm as any).arrivalBells) ? (wm as any).arrivalBells : [];
        if (bells.length < 1) {
          throw new AppError("Ring the arrival bell at delivery before closing the task.", 400);
        }
        if (!(wm as any).clientCollectedAt) {
          throw new AppError("Wait for the client to confirm parcel collection before closing the task.", 400);
        }
      } else if (task.status !== "in_progress" && task.status !== "accepted") {
        throw new AppError("Task must be in progress or accepted to complete", 400);
      }

      // Release escrow to runner (minus commission)
      const runnerWallet = await Wallet.findOne({ user: req.user!._id });
      if (!runnerWallet) throw new AppError("Wallet not found", 404);

      // Find escrow for this task
      const escrow = await Escrow.findOne({ task: task._id });
      const commission = escrow?.fees?.commission ?? Math.round(task.budget * 0.15 * 100) / 100;
      const runnersNet = escrow?.runnersNet ?? Math.max(0, Math.round((task.budget - commission) * 100) / 100);

      runnerWallet.balance += runnersNet;
      runnerWallet.transactions.push({
        type: "credit",
        amount: runnersNet,
        reference: task._id.toString(),
        createdAt: new Date(),
      });
      await runnerWallet.save();

      if (escrow) {
        escrow.status = "released";
        escrow.releasedAt = new Date();
        escrow.releaseReason = "task_completed";
        await escrow.save();
      }

      task.status = "completed";
      task.completedAt = new Date();
      if (v2) {
        task.closedAtDestination = true;
      }
      await task.save();

      await AuditLog.create({
        action: "TASK_COMPLETED",
        user: req.user!._id,
        target: task._id,
        meta: { taskId: task._id, budget: task.budget },
      });

      await sendNotification({
        userId: task.client.toString(),
        type: "TASK_COMPLETED",
        message: `Task "${task.title}" has been completed`,
        channel: "email",
        email: {
          subject: "Task Completed",
          html: `<p>Task "<strong>${task.title}</strong>" has been completed. Please leave a review!</p>`,
        },
      });

      // Note: client must confirm delivery closure at destination via /confirm-delivery

      res.json({ message: "Task completed successfully", task });
    } catch (err) {
      next(err);
    }
  }
);

// Cancel a task
router.post("/:id/cancel", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError("Task not found", 404);

    if (
      task.client.toString() !== req.user!._id.toString() &&
      task.runner?.toString() !== req.user!._id.toString()
    ) {
      throw new AppError("Unauthorized", 403);
    }

    // Refund escrow if task was funded and not completed
    if (task.escrowed && (task.status === "posted" || task.status === "accepted" || task.status === "in_progress")) {
      const clientWallet = await Wallet.findOne({ user: task.client });
      if (clientWallet) {
        clientWallet.balance += task.budget;
        clientWallet.transactions.push({
          type: "refund",
          amount: task.budget,
          reference: task._id.toString(),
          createdAt: new Date(),
        });
        await clientWallet.save();
      }

      // Mark escrow refunded if exists
      const escrow = await Escrow.findOne({ task: task._id });
      if (escrow) {
        escrow.status = "refunded";
        escrow.refundReason = "task_cancelled";
        escrow.refundedAt = new Date();
        await escrow.save();
      }
    }

    task.status = "cancelled";
    task.cancelledAt = new Date();
    await task.save();

    await AuditLog.create({
      action: "TASK_CANCELLED",
      user: req.user!._id,
      target: task._id,
      meta: { taskId: task._id },
    });

    res.json({ message: "Task cancelled successfully", task });
  } catch (err) {
    next(err);
  }
});

// Client confirms delivery at destination (closes the errand)
router.post('/:id/confirm-delivery', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) throw new AppError('Task not found', 404);

    if (task.client.toString() !== req.user!._id.toString()) {
      throw new AppError('Unauthorized', 403);
    }

    if (requiresErrandHandoverV2(task)) {
      if (task.closedAtDestination) {
        return res.json({ message: 'Delivery already confirmed.', task });
      }
      throw new AppError(
        'This errand uses the web handover flow. Confirm collection from your task page while the runner is delivering; the runner closes the task after that.',
        400
      );
    }

    if (task.status !== 'completed') {
      throw new AppError('Task must be completed before confirming delivery', 400);
    }

    task.closedAtDestination = true;
    await task.save();

    await AuditLog.create({ action: 'TASK_CLOSED_AT_DESTINATION', user: req.user!._id, target: task._id, meta: {} });

    res.json({ message: 'Delivery confirmed. Task closed at destination', task });
  } catch (err) {
    next(err);
  }
});

export default router;
