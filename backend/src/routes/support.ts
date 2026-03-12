// Support ticket routes
import express, { Response } from "express";
import SupportTicket from "../data/models/SupportTicket";
import AuditLog from "../data/models/AuditLog";
import AdminPermission from "../data/models/AdminPermission";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { supportTicketSchema } from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { sendNotification } from "../services/notification";

const router = express.Router();

const isSuperAdmin = (req: AuthRequest) =>
  (Array.isArray(req.user?.role) ? req.user?.role : [req.user?.role]).includes("superadmin");

// Create support ticket
router.post("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = supportTicketSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const { title, description, category, priority } = req.body;

    const ticket = await SupportTicket.create({
      user: req.user!._id,
      title,
      description,
      category,
      priority: priority || "medium",
    });

    await AuditLog.create({
      action: "SUPPORT_TICKET_CREATED",
      user: req.user!._id,
      target: ticket._id,
      meta: { title, category },
    });

    res.status(201).json({ message: "Support ticket created successfully", ticket });
  } catch (err) {
    next(err);
  }
});

// Get user's tickets
router.get("/my-tickets", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit, status } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const query: any = { user: req.user!._id };
    if (status) query.status = status;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      SupportTicket.countDocuments(query),
    ]);

    res.json({
      tickets,
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

// Get all tickets (admin only) - filtered by admin's support categories when not superadmin
router.get(
  "/",
  authenticate,
  authorize("admin", "superadmin"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { page, limit, status, category, priority } = req.query;
      const { skip, limit: limitNum } = getPaginationParams(
        page ? parseInt(page as string) : undefined,
        limit ? parseInt(limit as string) : undefined
      );

      const query: any = {};
      if (status) query.status = status;
      if (category) query.category = category;
      if (priority) query.priority = priority;

      // Non-superadmin: if they have AdminPermission, require support section; otherwise allow (legacy admins)
      if (!isSuperAdmin(req)) {
        const perm = await AdminPermission.findOne({ userId: req.user!._id }).lean();
        if (perm && !perm.sections?.includes("support")) {
          return res.status(403).json({ error: "Insufficient permissions for support" });
        }
        const cats = perm?.supportCategories ?? [];
        if (cats.length > 0) {
          if (category) {
            const main = (category as string).split(":")[0];
            if (!cats.includes(main)) {
              return res.json({ tickets: [], pagination: { total: 0, page: 1, limit: limitNum, pages: 0 } });
            }
            query.category = category;
          } else {
            query.category = { $in: cats.map((c) => new RegExp(`^${c}:`)) };
          }
        }
      }

      const [tickets, total] = await Promise.all([
        SupportTicket.find(query)
          .populate("user", "name email")
          .populate("assignedTo", "name")
          .sort({ priority: -1, createdAt: -1 })
          .skip(skip)
          .limit(limitNum),
        SupportTicket.countDocuments(query),
      ]);

      res.json({
        tickets,
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
  }
);

// Get ticket by ID
router.get("/:id", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate("user", "name email")
      .populate("assignedTo", "name")
      .populate("messages.sender", "name");

    if (!ticket) throw new AppError("Ticket not found", 404);

    const hasRole = (roles: any, r: string) => Array.isArray(roles) ? roles.includes(r) : roles === r;
    const isAdminOrSuper = hasRole(req.user!.role, "admin") || hasRole(req.user!.role, "superadmin");

    if (ticket.user.toString() === req.user!._id.toString()) {
      // Ticket owner - always allowed
    } else if (isAdminOrSuper) {
      if (!isSuperAdmin(req)) {
        const perm = await AdminPermission.findOne({ userId: req.user!._id }).lean();
        if (!perm?.sections?.includes("support")) throw new AppError("Insufficient permissions for support", 403);
        const cats = perm?.supportCategories ?? [];
        if (cats.length > 0) {
          const main = (ticket.category || "").split(":")[0];
          if (!cats.includes(main)) throw new AppError("Ticket category not in your assigned support areas", 403);
        }
      }
    } else {
      throw new AppError("Unauthorized", 403);
    }

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// Add message to ticket
router.post("/:id/messages", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) throw new AppError("Ticket not found", 404);

    const hasRole2 = (roles: any, r: string) => Array.isArray(roles) ? roles.includes(r) : roles === r;
    const isAdminOrSuper = hasRole2(req.user!.role, "admin") || hasRole2(req.user!.role, "superadmin");

    if (ticket.user.toString() === req.user!._id.toString()) {
      // Owner allowed
    } else if (isAdminOrSuper) {
      if (!isSuperAdmin(req)) {
        const perm = await AdminPermission.findOne({ userId: req.user!._id }).lean();
        if (!perm?.sections?.includes("support")) throw new AppError("Insufficient permissions for support", 403);
        const cats = perm?.supportCategories ?? [];
        if (cats.length > 0) {
          const main = (ticket.category || "").split(":")[0];
          if (!cats.includes(main)) throw new AppError("Ticket category not in your assigned support areas", 403);
        }
      }
    } else {
      throw new AppError("Unauthorized", 403);
    }

    const { message } = req.body;
    if (!message) throw new AppError("Message is required", 400);

    ticket.messages.push({
      sender: req.user!._id,
      message,
      createdAt: new Date(),
    });

    if (ticket.status === "open") {
      ticket.status = "in_progress";
    }

    await ticket.save();

    // Notify relevant parties
    if (ticket.user.toString() !== req.user!._id.toString()) {
      await sendNotification({
        userId: ticket.user.toString(),
        type: "SUPPORT_TICKET_UPDATE",
        message: `New reply on your support ticket: ${ticket.title}`,
      });
    }

    res.json({ message: "Message added successfully", ticket });
  } catch (err) {
    next(err);
  }
});

// Update ticket status (admin only)
router.put(
  "/:id/status",
  authenticate,
  authorize("admin", "superadmin"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { status } = req.body;
      if (!status) throw new AppError("Status is required", 400);

      const ticket = await SupportTicket.findById(req.params.id);
      if (!ticket) throw new AppError("Ticket not found", 404);

      if (!isSuperAdmin(req)) {
        const perm = await AdminPermission.findOne({ userId: req.user!._id }).lean();
        if (!perm?.sections?.includes("support")) throw new AppError("Insufficient permissions for support", 403);
        const cats = perm?.supportCategories ?? [];
        if (cats.length > 0) {
          const main = (ticket.category || "").split(":")[0];
          if (!cats.includes(main)) throw new AppError("Ticket category not in your assigned support areas", 403);
        }
      }

      ticket.status = status;
      if (status === "resolved") ticket.resolvedAt = new Date();
      if (status === "closed") ticket.closedAt = new Date();
      await ticket.save();

      await AuditLog.create({
        action: "SUPPORT_TICKET_STATUS_UPDATED",
        user: req.user!._id,
        target: ticket._id,
        meta: { status },
      });

      await sendNotification({
        userId: ticket.user.toString(),
        type: "SUPPORT_TICKET_STATUS",
        message: `Your support ticket status changed to: ${status}`,
      });

      res.json({ message: "Ticket status updated successfully", ticket });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
