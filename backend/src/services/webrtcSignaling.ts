// WebRTC signaling service - exchanges SDP offers/answers and ICE candidates via Socket.IO
import { Server as SocketServer } from "socket.io";
import { logger } from "./monitoring";
import { normalizeWebrtcUserId, userPresenceRoom } from "./webrtcUserId";
import { authenticateSocket, assertWebrtcRoomAccess, socketUserId } from "../utils/socketAuth";

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
  webrtcNs.use(authenticateSocket);

  /** Deliver to a specific peer (presence room + call room for reliability). */
  const emitToPeer = (
    event: string,
    payload: Record<string, unknown>,
    roomId: string,
    targetUserId: string
  ) => {
    const toUser = normalizeWebrtcUserId(targetUserId);
    if (toUser) {
      const presenceRoom = userPresenceRoom(toUser);
      const inPresence = webrtcNs.adapter.rooms.get(presenceRoom)?.size ?? 0;
      if (inPresence > 0) {
        webrtcNs.to(presenceRoom).emit(event, payload);
      } else {
        logger.warn(`emitToPeer: target not in presence room`, { event, targetUserId: toUser, roomId });
      }
    }
    if (roomId) {
      webrtcNs.to(roomId).emit(event, payload);
    }
  };

  webrtcNs.on("connection", (socket) => {
    logger.info("WebRTC client connected", { socketId: socket.id });

    /** Receive calls while not yet in the DM socket room (ring user by id). */
    socket.on("join-user-presence", (data: { userId: string }) => {
      const authId = authedSocketUserId(socket as any);
      const userId = normalizeWebrtcUserId(data?.userId);
      if (!userId || userId !== authId) return;
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
      socket.to(roomId).emit("peer-joined", { userId: authId, socketId: socket.id });
      logger.info("User joined call room", { roomId, userId: authId, socketId: socket.id });
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
          const size = webrtcNs.adapter.rooms.get(room)?.size ?? 0;
          webrtcNs.to(room).emit("call-request", payload);
          socket.to(roomId).emit("call-request", payload);
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
      (data: { roomId: string; calleeId?: string; calleeName?: string; callerId?: string }) => {
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
        const payload = { calleeId, calleeName, roomId, socketId: socket.id };
        if (callerId) {
          emitToPeer("call-accept", payload, roomId, callerId);
        } else {
          socket.to(roomId).emit("call-accept", payload);
        }
      }
    );

    socket.on("call-reject", (data: { roomId: string; calleeId?: string; callerId?: string }) => {
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
      const payload = { calleeId, roomId, socketId: socket.id };
      if (callerId) {
        emitToPeer("call-reject", payload, roomId, callerId);
      } else {
        socket.to(roomId).emit("call-reject", payload);
      }
    });

    socket.on("call-cancel", (data: { roomId: string; callerId?: string; calleeId?: string }) => {
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
      const payload = { callerId, roomId, socketId: socket.id };
      if (calleeId) {
        emitToPeer("call-cancel", payload, roomId, calleeId);
      } else {
        socket.to(roomId).emit("call-cancel", payload);
      }
    });

    const forwardOffer = (data: { roomId: string; toUserId: string; offer: RTCSessionDescriptionLike }) => {
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
      const payload = { fromUserId, toUserId: toUser, offer, roomId };
      emitToPeer("webrtc-offer", payload, roomId, toUser);
    };

    const forwardAnswer = (data: { roomId: string; toUserId: string; answer: RTCSessionDescriptionLike }) => {
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
      const payload = { fromUserId, toUserId: toUser, answer, roomId };
      emitToPeer("webrtc-answer", payload, roomId, toUser);
    };

    const forwardIce = (data: { roomId: string; toUserId: string; candidate: RTCIceCandidateLike }) => {
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
      const payload = { fromUserId, toUserId: toUser, candidate, roomId };
      emitToPeer("webrtc-ice-candidate", payload, roomId, toUser);
    };

    const forwardHangup = (data: { roomId: string; toUserId: string }) => {
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
      const payload = { fromUserId, toUserId: toUser, roomId };
      emitToPeer("webrtc-hangup", payload, roomId, toUser);
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
