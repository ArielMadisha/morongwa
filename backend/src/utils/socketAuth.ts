import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../data/models/User";
import Task from "../data/models/Task";
import { getJwtSecret } from "./secrets";

export type AuthedSocket = Socket & { data: { userId?: string } };

function extractBearerToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.trim()) return authToken.trim();
  const header = socket.handshake.headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

/** Socket.IO middleware — validates JWT and binds userId to socket.data. */
export async function authenticateSocket(socket: Socket, next: (err?: Error) => void): Promise<void> {
  try {
    const token = extractBearerToken(socket);
    if (!token) return next(new Error("Unauthorized"));

    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    const user = await User.findById(decoded.userId).select("_id active suspended locked").lean();
    if (!user || user.active === false || user.suspended || user.locked) {
      return next(new Error("Unauthorized"));
    }
    socket.data.userId = String(user._id);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}

export function socketUserId(socket: Socket): string {
  return String(socket.data?.userId || "");
}

/** Client or assigned runner on a task may join task chat / locations. */
export async function assertTaskParticipant(taskId: string, userId: string): Promise<void> {
  const task = await Task.findById(taskId).select("client runner").lean();
  if (!task) throw new Error("Task not found");
  const uid = String(userId);
  const clientId = String(task.client);
  const runnerId = task.runner ? String(task.runner) : "";
  if (uid !== clientId && uid !== runnerId) {
    throw new Error("Forbidden");
  }
}

/** User may only join their own notification room. */
export function assertOwnUserRoom(roomId: string, userId: string): void {
  const normalized = String(roomId || "").trim();
  if (!normalized || normalized !== String(userId)) {
    throw new Error("Forbidden");
  }
}

/** 1:1 or group WebRTC room — caller must be a participant encoded in roomId. */
export function assertWebrtcRoomAccess(roomId: string, userId: string): void {
  const rid = String(roomId || "").trim();
  const uid = String(userId || "").trim();
  if (!rid || !uid) throw new Error("Forbidden");

  const direct = /^direct-([a-f0-9]{24})-([a-f0-9]{24})$/i.exec(rid);
  if (direct) {
    const [, a, b] = direct;
    if (uid !== a && uid !== b) throw new Error("Forbidden");
    return;
  }

  if (rid.startsWith("group-")) {
    if (!rid.includes(uid)) throw new Error("Forbidden");
    return;
  }

  /** Morongwa Meet — any signed-in user who obtained the meeting ID may join. */
  if (rid.startsWith("meeting-")) {
    return;
  }

  throw new Error("Forbidden");
}
