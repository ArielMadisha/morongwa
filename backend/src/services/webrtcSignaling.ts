// WebRTC signaling service - exchanges SDP offers/answers and ICE candidates via Socket.IO
import { Server as SocketServer } from "socket.io";
import { logger } from "./monitoring";

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

  webrtcNs.on("connection", (socket) => {
    logger.info("WebRTC client connected", { socketId: socket.id });

    /** Receive calls while not yet in the DM socket room (ring user by id). */
    socket.on("join-user-presence", (data: { userId: string }) => {
      const { userId } = data;
      if (!userId) return;
      socket.join(`user-${userId}`);
      (socket as any).presenceUserId = userId;
    });

    socket.on("join-call-room", (data: { roomId: string; userId: string }) => {
      const { roomId, userId } = data;
      if (!roomId || !userId) return;
      socket.join(roomId);
      socket.join(`user-${userId}`);
      (socket as any).callRoomId = roomId;
      (socket as any).userId = userId;
      socket.to(roomId).emit("peer-joined", { userId, socketId: socket.id });
      logger.info("User joined call room", { roomId, userId, socketId: socket.id });
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
      (data: { roomId: string; callerId: string; callerName?: string; calleeId?: string }) => {
        const { roomId, callerId, callerName, calleeId } = data;
        if (!roomId || !callerId) return;
        const payload = { callerId, callerName, roomId, socketId: socket.id };
        if (calleeId) {
          webrtcNs.to(`user-${calleeId}`).emit("call-request", payload);
        } else {
          socket.to(roomId).emit("call-request", payload);
        }
      }
    );

    socket.on(
      "call-accept",
      (data: { roomId: string; calleeId: string; calleeName?: string; callerId?: string }) => {
        const { roomId, calleeId, calleeName, callerId } = data;
        if (!roomId || !calleeId) return;
        const payload = { calleeId, calleeName, roomId, socketId: socket.id };
        if (callerId) {
          webrtcNs.to(`user-${callerId}`).emit("call-accept", payload);
        } else {
          socket.to(roomId).emit("call-accept", payload);
        }
      }
    );

    socket.on("call-reject", (data: { roomId: string; calleeId: string; callerId?: string }) => {
      const { roomId, calleeId, callerId } = data;
      if (!roomId || !calleeId) return;
      const payload = { calleeId, roomId, socketId: socket.id };
      if (callerId) {
        webrtcNs.to(`user-${callerId}`).emit("call-reject", payload);
      } else {
        socket.to(roomId).emit("call-reject", payload);
      }
    });

    socket.on("call-cancel", (data: { roomId: string; callerId: string; calleeId?: string }) => {
      const { roomId, callerId, calleeId } = data;
      if (!roomId || !callerId) return;
      const payload = { callerId, roomId, socketId: socket.id };
      if (calleeId) {
        webrtcNs.to(`user-${calleeId}`).emit("call-cancel", payload);
      } else {
        socket.to(roomId).emit("call-cancel", payload);
      }
    });

    const forwardOffer = (data: { roomId: string; toUserId: string; offer: RTCSessionDescriptionLike }) => {
      const { roomId, toUserId, offer } = data;
      if (!roomId || !offer || !toUserId) return;
      const fromUserId = (socket as any).userId;
      const payload = { fromUserId, toUserId, offer, roomId };
      webrtcNs.to(`user-${toUserId}`).emit("webrtc-offer", payload);
    };

    const forwardAnswer = (data: { roomId: string; toUserId: string; answer: RTCSessionDescriptionLike }) => {
      const { roomId, toUserId, answer } = data;
      if (!roomId || !answer || !toUserId) return;
      const fromUserId = (socket as any).userId;
      const payload = { fromUserId, toUserId, answer, roomId };
      webrtcNs.to(`user-${toUserId}`).emit("webrtc-answer", payload);
    };

    const forwardIce = (data: { roomId: string; toUserId: string; candidate: RTCIceCandidateLike }) => {
      const { roomId, toUserId, candidate } = data;
      if (!roomId || !candidate || !toUserId) return;
      const fromUserId = (socket as any).userId;
      const payload = { fromUserId, toUserId, candidate, roomId };
      webrtcNs.to(`user-${toUserId}`).emit("webrtc-ice-candidate", payload);
    };

    const forwardHangup = (data: { roomId: string; toUserId: string }) => {
      const { roomId, toUserId } = data;
      if (!roomId || !toUserId) return;
      const fromUserId = (socket as any).userId;
      const payload = { fromUserId, toUserId, roomId };
      webrtcNs.to(`user-${toUserId}`).emit("webrtc-hangup", payload);
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
