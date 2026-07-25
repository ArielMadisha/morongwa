#!/usr/bin/env node
/**
 * Simulates production browser: ONE /webrtc socket per user (presence + call).
 * Usage: node scripts/smokeWebrtcBrowserParity.mjs <callerId> <calleeId> [--prod]
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { io } = require(path.join(__dirname, "..", "..", "frontend", "node_modules", "socket.io-client", "build", "cjs", "index.js"));

const args = process.argv.slice(2).filter((a) => a !== "--prod");
const useProd = process.argv.includes("--prod");
const [callerId, calleeId] = args;

if (!callerId || !calleeId) {
  console.error("Usage: node scripts/smokeWebrtcBrowserParity.mjs <callerUserId> <calleeUserId> [--prod]");
  process.exit(1);
}

const API_BASE = useProd ? "https://api.qwertymates.com" : (process.env.API_URL || "http://localhost:4000").replace(/\/$/, "");
const SOCKET_BASE = API_BASE.replace(/\/api$/, "");

function tokenFor(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing in backend/.env");
  return jwt.sign({ userId }, secret, { expiresIn: "1h" });
}

function directRoom(a, b) {
  const [x, y] = [String(a), String(b)].sort();
  return `direct-${x}-${y}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connectWebrtc(token, label) {
  return new Promise((resolve, reject) => {
    const socket = io(`${SOCKET_BASE}/webrtc`, {
      auth: { token },
      transports: ["polling", "websocket"],
      timeout: 15000,
    });
    const timer = setTimeout(() => reject(new Error(`${label}: connect timeout`)), 15000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const roomId = directRoom(callerId, calleeId);
  console.log(`Single-socket browser smoke: ${API_BASE}`);
  console.log(`Room: ${roomId}`);

  const callerSocket = await connectWebrtc(tokenFor(callerId), "caller");
  const calleeSocket = await connectWebrtc(tokenFor(calleeId), "callee");

  callerSocket.emit("join-user-presence", { userId: callerId });
  calleeSocket.emit("join-user-presence", { userId: calleeId });
  await sleep(400);

  let ring = false;
  let accept = false;
  let offer = false;
  let answer = false;

  const cleanup = () => {
    callerSocket.disconnect();
    calleeSocket.disconnect();
  };

  calleeSocket.on("call-request", (data) => {
    ring = true;
    console.log("OK callee: call-request", { callerSocketId: data.socketId });
    calleeSocket.emit("join-call-room", { roomId: data.roomId, userId: calleeId });
    calleeSocket.emit("call-accept", {
      roomId: data.roomId,
      calleeId,
      callerId: data.callerId,
      callerSocketId: data.socketId,
    });
  });

  callerSocket.on("call-accept", (data) => {
    accept = true;
    console.log("OK caller: call-accept", { calleeSocketId: data.socketId });
    callerSocket.emit("webrtc-offer", {
      roomId,
      toUserId: calleeId,
      toSocketId: data.socketId,
      offer: { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" },
    });
  });

  calleeSocket.on("webrtc-offer", (data) => {
    offer = true;
    console.log("OK callee: webrtc-offer", { fromSocketId: data.fromSocketId });
    calleeSocket.emit("webrtc-answer", {
      roomId,
      toUserId: callerId,
      toSocketId: callerSocket.id,
      answer: { type: "answer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" },
    });
  });

  callerSocket.on("webrtc-answer", (data) => {
    answer = true;
    console.log("OK caller: webrtc-answer", { fromSocketId: data.fromSocketId });
  });

  callerSocket.emit("join-call-room", { roomId, userId: callerId });
  await sleep(300);
  callerSocket.emit("call-request", {
    roomId,
    callerId,
    callerName: "Smoke Caller",
    calleeId,
    audioOnly: false,
  });

  await sleep(2500);
  cleanup();

  if (!ring) console.error("FAIL: no call-request (popup path)");
  if (!accept) console.error("FAIL: caller never got call-accept");
  if (!offer) console.error("FAIL: callee never got webrtc-offer");
  if (!answer) console.error("FAIL: caller never got webrtc-answer");

  if (ring && accept && offer && answer) {
    console.log("\nPASS: single-socket browser signaling");
    process.exit(0);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
