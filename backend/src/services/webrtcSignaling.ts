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

    socket.on("call-request", (data: { roomId: string; callerId: string; callerName?: string }) => {
      const { roomId, callerId, callerName } = data;
      if (!roomId || !callerId) return;
      socket.to(roomId).emit("call-request", { callerId, callerName, socketId: socket.id });
    });

    socket.on("call-accept", (data: { roomId: string; calleeId: string; calleeName?: string }) => {
      const { roomId, calleeId, calleeName } = data;
      if (!roomId || !calleeId) return;
      socket.to(roomId).emit("call-accept", { calleeId, calleeName, socketId: socket.id });
    });

    socket.on("call-reject", (data: { roomId: string; calleeId: string }) => {
      const { roomId, calleeId } = data;
      if (!roomId || !calleeId) return;
      socket.to(roomId).emit("call-reject", { calleeId, socketId: socket.id });
    });

    socket.on("call-cancel", (data: { roomId: string; callerId: string }) => {
      const { roomId, callerId } = data;
      if (!roomId || !callerId) return;
      socket.to(roomId).emit("call-cancel", { callerId, socketId: socket.id });
    });

    socket.on("webrtc-offer", (data: { roomId: string; toUserId: string; offer: RTCSessionDescriptionLike }) => {
      const { roomId, toUserId, offer } = data;
      if (!roomId || !offer || !toUserId) return;
      webrtcNs.to(`user-${toUserId}`).emit("webrtc-offer", { fromUserId: (socket as any).userId, toUserId, offer });
    });

    socket.on("webrtc-answer", (data: { roomId: string; toUserId: string; answer: RTCSessionDescriptionLike }) => {
      const { roomId, toUserId, answer } = data;
      if (!roomId || !answer || !toUserId) return;
      webrtcNs.to(`user-${toUserId}`).emit("webrtc-answer", { fromUserId: (socket as any).userId, toUserId, answer });
    });

    socket.on("webrtc-ice-candidate", (data: { roomId: string; toUserId: string; candidate: RTCIceCandidateLike }) => {
      const { roomId, toUserId, candidate } = data;
      if (!roomId || !candidate || !toUserId) return;
      webrtcNs.to(`user-${toUserId}`).emit("webrtc-ice-candidate", {
        fromUserId: (socket as any).userId,
        toUserId,
        candidate,
      });
    });

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
