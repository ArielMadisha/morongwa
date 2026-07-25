// WebRTC signaling service - exchanges SDP offers/answers and ICE candidates via Socket.IO
import { Server as SocketServer } from "socket.io";
import { logger } from "./monitoring";
import { normalizeWebrtcUserId, userPresenceRoom } from "./webrtcUserId";
import { authenticateSocket, assertWebrtcRoomAccess, socketUserId } from "../utils/socketAuth";

let webrtcNsRef: ReturnType<SocketServer["of"]> | null = null;

export type MeetingInvitePayload = {
  meetingId: string;
  title: string;
  roomId: string;
  hostUserId: string;
  hostName: string;
  joinUrl: string;
};

/** Push a meeting invite to an online user's presence room (realtime in-app alert). */
export function emitMeetingInvite(targetUserId: string, payload: MeetingInvitePayload): void {
  try {
    const toUser = normalizeWebrtcUserId(targetUserId);
    if (!webrtcNsRef || !toUser) return;
    webrtcNsRef.to(userPresenceRoom(toUser)).emit("meeting-invite", payload);
  } catch (e) {
    logger.warn("emitMeetingInvite failed (non-fatal)", { error: e });
  }
}

function authedSocketUserId(socket: { data?: { userId?: string }; userId?: string; presenceUserId?: string }): string {
  return socketUserId(socket as any) || normalizeWebrtcUserId(socket.userId || socket.presenceUserId);
}

/** WebRTC types (DOM lib may not be available in Node) */
interface RTCSessionDescriptionLike {
  type?: RTCSdpType;
  sdp?: string;
}
interface RTCIceCandidateLike {
  candidate?: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
}
type RTCSdpType = "offer" | "answer" | "pranswer" | "rollback";

export const initializeWebRTCSignaling = (socketServer: SocketServer): void => {
  const webrtcNs = socketServer.of("/webrtc");
  webrtcNsRef = webrtcNs;
  webrtcNs.use(authenticateSocket);

  /** Ring & media events: use aggressive fan-out (socket id → room → presence). */
  const RING_EVENTS = new Set(["call-accept", "call-reject", "call-cancel"]);
  const MEDIA_EVENTS = new Set(["webrtc-offer", "webrtc-answer", "webrtc-ice-candidate", "webrtc-hangup"]);

  const deliverToPeer = (
    event: string,
    payload: Record<string, unknown>,
    roomId: string,
    targetUserId: string,
    targetSocketId?: string
  ) => {
    const toUser = normalizeWebrtcUserId(targetUserId);
    const rid = String(roomId || "").trim();
    const sid = String(targetSocketId || "").trim();
    let delivered = false;

    const emitRoom = (room: string) => {
      const size = webrtcNs.adapter.rooms.get(room)?.size ?? 0;
      if (size > 0) {
        webrtcNs.to(room).emit(event, payload);
        delivered = true;
      }
    };

    // Aggressive fan-out for both ring and media events
    if (sid && webrtcNs.sockets.has(sid)) {
      webrtcNs.to(sid).emit(event, payload);
      delivered = true;
    }
    if (toUser) emitRoom(userPresenceRoom(toUser));
    if (rid) emitRoom(rid);
    
    if (!delivered) {
      // CRITICAL: Log ALL failed delivery attempts, especially for media (offer/answer/ICE)
      logger.error(`deliverToPeer FAILED: ${event} not delivered`, {
        event,
        targetUserId: toUser,
        roomId: rid,
        targetSocketId: sid,
        socketExists: sid ? webrtcNs.sockets.has(sid) : false,
        presenceRoomSize: toUser ? (webrtcNs.adapter.rooms.get(userPresenceRoom(toUser))?.size ?? 0) : 0,
        callRoomSize: rid ? (webrtcNs.adapter.rooms.get(rid)?.size ?? 0) : 0,
        totalSockets: webrtcNs.sockets.size,
        totalRooms: webrtcNs.adapter.rooms.size,
      });
    }
  };

  webrtcNs.on("connection", (socket) => {
    const authId = authedSocketUserId(socket as any);
    if (authId) {
      const presenceRoom = userPresenceRoom(authId);
      socket.join(presenceRoom);
      (socket as any).presenceUserId = authId;
      logger.info("WebRTC client connected (presence auto-join)", { socketId: socket.id, userId: authId });
    } else {
      logger.info("WebRTC client connected", { socketId: socket.id });
    }

    /** Receive calls while not yet in the DM socket room (ring user by id). */
    socket.on("join-user-presence", (data: { userId: string }) => {
      const joinAuthId = authedSocketUserId(socket as any);
      const userId = normalizeWebrtcUserId(data?.userId);
      if (!userId || userId !== joinAuthId) return;
      socket.join(userPresenceRoom(userId));
      (socket as any).presenceUserId = userId;
    });

    socket.on("join-call-room", (data: { roomId: string; userId?: string }) => {
      const authId = authedSocketUserId(socket as any);
      const roomId = String(data?.roomId || "").trim();
      if (!roomId || !authId) return;
      try {
        assertWebrtcRoomAccess(roomId, authId);
      } catch {
        return;
      }
      socket.join(roomId);
      socket.join(userPresenceRoom(authId));
      (socket as any).callRoomId = roomId;
      (socket as any).userId = authId;

      const peers: string[] = [];
      const roomSet = webrtcNs.adapter.rooms.get(roomId);
      if (roomSet) {
        for (const sid of roomSet) {
          if (sid === socket.id) continue;
          const peerSocket = webrtcNs.sockets.get(sid) as { userId?: string } | undefined;
          const peerId = normalizeWebrtcUserId(peerSocket?.userId);
          if (peerId && peerId !== authId) peers.push(peerId);
        }
      }
      socket.emit("room-peers", { roomId, peers });

      socket.to(roomId).emit("peer-joined", { userId: authId, socketId: socket.id });
      logger.info("User joined call room", { roomId, userId: authId, socketId: socket.id, peerCount: peers.length });
    });

    socket.on("leave-call-room", () => {
      const roomId = (socket as any).callRoomId;
      const userId = (socket as any).userId;
      if (roomId) {
        socket.leave(roomId);
        socket.to(roomId).emit("peer-left", { userId, socketId: socket.id });
      }
      (socket as any).callRoomId = undefined;
      (socket as any).userId = undefined;
    });

    socket.on(
      "call-request",
      (data: { roomId: string; callerId?: string; callerName?: string; calleeId?: string; audioOnly?: boolean }) => {
        const authId = authedSocketUserId(socket as any);
        const roomId = String(data?.roomId || "").trim();
        const callerId = normalizeWebrtcUserId(data?.callerId) || authId;
        if (callerId !== authId) return;
        if (!roomId || !callerId) return;
        try {
          assertWebrtcRoomAccess(roomId, authId);
        } catch {
          return;
        }
        const callerName = data?.callerName;
        const calleeId = normalizeWebrtcUserId(data?.calleeId);
        const audioOnly = !!data?.audioOnly;
        const payload = { callerId, callerName, roomId, socketId: socket.id, audioOnly };
        if (calleeId) {
          const room = userPresenceRoom(calleeId);
          webrtcNs.to(room).emit("call-request", payload);
          const size = webrtcNs.adapter.rooms.get(room)?.size ?? 0;
          if (size === 0) {
            logger.warn("call-request: callee not in presence room", { calleeId, roomId });
            socket.emit("call-unavailable", {
              calleeId,
              roomId,
              reason: "offline",
            });
          }
        } else {
          socket.to(roomId).emit("call-request", payload);
        }
      }
    );

    socket.on(
      "call-accept",
      (data: {
        roomId: string;
        calleeId?: string;
        calleeName?: string;
        callerId?: string;
        callerSocketId?: string;
      }) => {
        const authId = authedSocketUserId(socket as any);
        const roomId = String(data?.roomId || "").trim();
        const calleeId = normalizeWebrtcUserId(data?.calleeId) || authId;
        if (calleeId !== authId) return;
        if (!roomId || !calleeId) return;
        try {
          assertWebrtcRoomAccess(roomId, authId);
        } catch {
          return;
        }
        const calleeName = data?.calleeName;
        const callerId = normalizeWebrtcUserId(data?.callerId);
        const callerSocketId = String(data?.callerSocketId || "").trim();
        const payload = { calleeId, calleeName, roomId, socketId: socket.id };
        logger.info("call-accept: received, forwarding to caller", {
          calleeId,
          callerId,
          roomId,
          calleeSocketId: socket.id,
          callerSocketId,
        });
        if (callerId) {
          deliverToPeer("call-accept", payload, roomId, callerId, callerSocketId);
        } else {
          socket.to(roomId).emit("call-accept", payload);
        }
      }
    );

    socket.on(
      "call-reject",
      (data: { roomId: string; calleeId?: string; callerId?: string; callerSocketId?: string }) => {
        const authId = authedSocketUserId(socket as any);
        const roomId = String(data?.roomId || "").trim();
        const calleeId = normalizeWebrtcUserId(data?.calleeId) || authId;
        if (calleeId !== authId) return;
        if (!roomId || !calleeId) return;
        try {
          assertWebrtcRoomAccess(roomId, authId);
        } catch {
          return;
        }
        const callerId = normalizeWebrtcUserId(data?.callerId);
        const callerSocketId = String(data?.callerSocketId || "").trim();
        const payload = { calleeId, roomId, socketId: socket.id };
        if (callerId) {
          deliverToPeer("call-reject", payload, roomId, callerId, callerSocketId);
        } else {
          socket.to(roomId).emit("call-reject", payload);
        }
      }
    );

    socket.on(
      "call-cancel",
      (data: { roomId: string; callerId?: string; calleeId?: string; calleeSocketId?: string }) => {
        const authId = authedSocketUserId(socket as any);
        const roomId = String(data?.roomId || "").trim();
        const callerId = normalizeWebrtcUserId(data?.callerId) || authId;
        if (callerId !== authId) return;
        if (!roomId || !callerId) return;
        try {
          assertWebrtcRoomAccess(roomId, authId);
        } catch {
          return;
        }
        const calleeId = normalizeWebrtcUserId(data?.calleeId);
        const calleeSocketId = String(data?.calleeSocketId || "").trim();
        const payload = { callerId, roomId, socketId: socket.id };
        if (calleeId) {
          deliverToPeer("call-cancel", payload, roomId, calleeId, calleeSocketId);
        } else {
          socket.to(roomId).emit("call-cancel", payload);
        }
      }
    );

    const forwardOffer = (data: {
      roomId: string;
      toUserId: string;
      toSocketId?: string;
      offer: RTCSessionDescriptionLike;
    }) => {
      const authId = authedSocketUserId(socket as any);
      const { roomId, toUserId, offer } = data;
      if (!roomId || !offer || !toUserId || !authId) return;
      try {
        assertWebrtcRoomAccess(roomId, authId);
      } catch {
        return;
      }
      const fromUserId = authId;
      const toUser = normalizeWebrtcUserId(toUserId);
      const toSocketId = String(data.toSocketId || "").trim();
      const payload = { fromUserId, toUserId: toUser, offer, roomId, fromSocketId: socket.id };
      logger.info("webrtc-offer: forwarding", {
        fromUserId,
        toUserId: toUser,
        roomId,
        fromSocketId: socket.id,
        toSocketId,
        offerType: offer.type,
      });
      deliverToPeer("webrtc-offer", payload, roomId, toUser, toSocketId);
    };

    const forwardAnswer = (data: {
      roomId: string;
      toUserId: string;
      toSocketId?: string;
      answer: RTCSessionDescriptionLike;
    }) => {
      const authId = authedSocketUserId(socket as any);
      const { roomId, toUserId, answer } = data;
      if (!roomId || !answer || !toUserId || !authId) return;
      try {
        assertWebrtcRoomAccess(roomId, authId);
      } catch {
        return;
      }
      const fromUserId = authId;
      const toUser = normalizeWebrtcUserId(toUserId);
      const toSocketId = String(data.toSocketId || "").trim();
      const payload = { fromUserId, toUserId: toUser, answer, roomId, fromSocketId: socket.id };
      logger.info("webrtc-answer: forwarding", {
        fromUserId,
        toUserId: toUser,
        roomId,
        fromSocketId: socket.id,
        toSocketId,
        answerType: answer.type,
      });
      deliverToPeer("webrtc-answer", payload, roomId, toUser, toSocketId);
    };

    const forwardIce = (data: {
      roomId: string;
      toUserId: string;
      toSocketId?: string;
      candidate: RTCIceCandidateLike;
    }) => {
      const authId = authedSocketUserId(socket as any);
      const { roomId, toUserId, candidate } = data;
      if (!roomId || !candidate || !toUserId || !authId) return;
      try {
        assertWebrtcRoomAccess(roomId, authId);
      } catch {
        return;
      }
      const fromUserId = authId;
      const toUser = normalizeWebrtcUserId(toUserId);
      const toSocketId = String(data.toSocketId || "").trim();
      const payload = { fromUserId, toUserId: toUser, candidate, roomId, fromSocketId: socket.id };
      // Log ICE candidates at debug level to avoid noise (can be many)
      logger.debug("webrtc-ice-candidate: forwarding", {
        fromUserId,
        toUserId: toUser,
        roomId,
        fromSocketId: socket.id,
        toSocketId,
        candidatePartial: candidate.candidate?.substring(0, 50),
      });
      deliverToPeer("webrtc-ice-candidate", payload, roomId, toUser, toSocketId);
    };

    const forwardHangup = (data: { roomId: string; toUserId: string; toSocketId?: string }) => {
      const authId = authedSocketUserId(socket as any);
      const { roomId, toUserId } = data;
      if (!roomId || !toUserId || !authId) return;
      try {
        assertWebrtcRoomAccess(roomId, authId);
      } catch {
        return;
      }
      const fromUserId = authId;
      const toUser = normalizeWebrtcUserId(toUserId);
      const toSocketId = String(data.toSocketId || "").trim();
      const payload = { fromUserId, toUserId: toUser, roomId };
      deliverToPeer("webrtc-hangup", payload, roomId, toUser, toSocketId);
    };

    socket.on("webrtc-offer", forwardOffer);
    socket.on("offer", forwardOffer);

    socket.on("webrtc-answer", forwardAnswer);
    socket.on("answer", forwardAnswer);

    socket.on("webrtc-ice-candidate", forwardIce);
    socket.on("ice-candidate", forwardIce);
    socket.on("ice", forwardIce);

    socket.on("webrtc-hangup", forwardHangup);
    socket.on("hangup", forwardHangup);

    socket.on("disconnect", () => {
      const roomId = (socket as any).callRoomId;
      const userId = (socket as any).userId;
      if (roomId) {
        socket.to(roomId).emit("peer-left", { userId, socketId: socket.id });
      }
      logger.info("WebRTC client disconnected", { socketId: socket.id });
    });
  });

  logger.info("WebRTC signaling service initialized");
};
