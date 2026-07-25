#!/usr/bin/env node
/**
 * Smoke-test Morongwa WebRTC signaling + TURN between two user ids.
 * Usage: node scripts/smokeWebrtcSignaling.mjs <callerUserId> <calleeUserId> [--prod]
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
  console.error("Usage: node scripts/smokeWebrtcSignaling.mjs <callerUserId> <calleeUserId> [--prod]");
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

async function testTurn(token) {
  const res = await fetch(`${API_BASE}/api/webrtc/turn-credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function connectWebrtc(token, label) {
  return new Promise((resolve, reject) => {
    const socket = io(`${SOCKET_BASE}/webrtc`, {
      auth: { token },
      transports: ["polling", "websocket"],
      timeout: 15000,
    });
    const timer = setTimeout(() => reject(new Error(`${label}: socket connect timeout`)), 15000);
    socket.on("connect", () => {
      clearTimeout(timer);
      console.log(`OK ${label}: socket connected (${socket.id})`);
      resolve(socket);
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${label}: ${err.message}`));
    });
  });
}

async function main() {
  const roomId = directRoom(callerId, calleeId);
  console.log(`API: ${API_BASE}`);
  console.log(`Room: ${roomId}`);
  console.log(`Caller: ${callerId}`);
  console.log(`Callee: ${calleeId}`);

  const callerToken = tokenFor(callerId);
  const calleeToken = tokenFor(calleeId);

  const turnCaller = await testTurn(callerToken);
  console.log(`TURN caller HTTP ${turnCaller.status}`, turnCaller.body?.data ? {
    urls: turnCaller.body.data.urls,
    usernamePrefix: String(turnCaller.body.data.username || "").slice(0, 20),
    hasCredential: Boolean(turnCaller.body.data.credential),
    fallback: turnCaller.body.data.fallback,
  } : turnCaller.body);

  if (turnCaller.status !== 200) {
    console.error("FAIL: TURN credentials unavailable");
    process.exit(1);
  }

  const calleeSocket = await connectWebrtc(calleeToken, "callee");
  const callerSocket = await connectWebrtc(callerToken, "caller");

  calleeSocket.emit("join-user-presence", { userId: calleeId });
  await sleep(300);

  let calleeGotRequest = false;
  let callerGotAccept = false;
  let callerGotAnswer = false;

  const cleanup = () => {
    callerSocket.disconnect();
    calleeSocket.disconnect();
  };

    calleeSocket.on("call-request", (data) => {
    calleeGotRequest = true;
    console.log("OK callee: received call-request", { callerId: data.callerId, roomId: data.roomId, audioOnly: data.audioOnly });
    calleeSocket.emit("join-call-room", { roomId: data.roomId, userId: calleeId });
    calleeSocket.emit("call-accept", {
      roomId: data.roomId,
      calleeId,
      calleeName: "Smoke Callee",
      callerId: data.callerId,
      callerSocketId: data.socketId,
    });
  });

  callerSocket.on("call-accept", (data) => {
    callerGotAccept = true;
    console.log("OK caller: received call-accept", { calleeId: data.calleeId, roomId: data.roomId });
    const fakeOffer = { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" };
    callerSocket.emit("webrtc-offer", {
      roomId,
      toUserId: calleeId,
      toSocketId: data.socketId,
      offer: fakeOffer,
    });
  });

  calleeSocket.on("webrtc-offer", (data) => {
    console.log("OK callee: received webrtc-offer from", data.fromUserId);
    const fakeAnswer = { type: "answer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" };
    calleeSocket.emit("webrtc-answer", {
      roomId,
      toUserId: callerId,
      toSocketId: callerSocket.id,
      answer: fakeAnswer,
    });
  });

  callerSocket.on("webrtc-answer", (data) => {
    callerGotAnswer = true;
    console.log("OK caller: received webrtc-answer from", data.fromUserId);
  });

  callerSocket.on("call-unavailable", (data) => {
    console.error("FAIL caller: call-unavailable", data);
  });

  callerSocket.emit("join-user-presence", { userId: callerId });
  callerSocket.emit("join-call-room", { roomId, userId: callerId });
  await sleep(300);

  callerSocket.emit("call-request", {
    roomId,
    callerId,
    callerName: "Smoke Caller",
    calleeId,
    audioOnly: false,
  });

  await sleep(2000);

  const ok = calleeGotRequest && callerGotAccept && callerGotAnswer;
  cleanup();

  if (!calleeGotRequest) console.error("FAIL: callee did not receive call-request (presence offline?)");
  if (!callerGotAccept) console.error("FAIL: caller did not receive call-accept");
  if (!callerGotAnswer) console.error("FAIL: caller did not receive webrtc-answer");

  if (ok) {
    console.log("\nPASS: signaling path works for these users");
    process.exit(0);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
