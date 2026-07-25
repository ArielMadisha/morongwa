import { Alert, AppState, type AppStateStatus } from "react-native";
import { getSharedCallSignalingClient } from "./callSignaling";

export type IncomingCallPayload = {
  callerId: string;
  callerName?: string;
  roomId: string;
  audioOnly?: boolean;
};

type IncomingHandler = (call: IncomingCallPayload) => void;

/** Global Morongwa incoming-call listener (join-user-presence while app is open). */
export class CallPresenceService {
  private signaling = getSharedCallSignalingClient();
  private userId = "";
  private onIncoming: IncomingHandler | null = null;
  private appStateSub: { remove: () => void } | null = null;

  start(userId: string, onIncoming: IncomingHandler) {
    const uid = String(userId || "").trim();
    if (!uid) return;
    this.userId = uid;
    this.onIncoming = onIncoming;

    const s = this.signaling.connect();
    const joinPresence = () => {
      s.emit("join-user-presence", { userId: uid });
    };

    s.off("connect");
    s.off("call-request");
    s.off("call-cancel");

    s.on("connect", joinPresence);
    s.io.on("reconnect", joinPresence);

    s.on("call-request", (data: Record<string, unknown>) => {
      const callerId = String(data.callerId ?? "").trim();
      const roomId = String(data.roomId ?? "").trim();
      if (!callerId || !roomId) return;
      this.onIncoming?.({
        callerId,
        callerName: data.callerName ? String(data.callerName) : undefined,
        roomId,
        audioOnly: !!data.audioOnly,
      });
    });

    s.on("call-cancel", () => {
      /* callee UI can ignore; CallScreen handles end */
    });

    if (s.connected) joinPresence();

    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
        if (state === "active" && this.userId) joinPresence();
      });
    }
  }

  stop() {
    this.onIncoming = null;
    this.userId = "";
    // Keep shared socket alive for CallScreen; only detach listeners.
    const s = this.signaling.getSocket();
    if (s) {
      s.off("connect");
      s.off("call-request");
      s.off("call-cancel");
      s.io.off("reconnect");
    }
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  showIncomingAlert(call: IncomingCallPayload, onAccept: () => void, onDecline: () => void) {
    const name = call.callerName || "Someone";
    const kind = call.audioOnly ? "voice" : "video";
    Alert.alert(
      `Incoming ${kind} call`,
      `${name} is calling you on Morongwa.`,
      [
        { text: "Decline", style: "cancel", onPress: onDecline },
        { text: "Accept", onPress: onAccept },
      ],
      { cancelable: false }
    );
  }

  emitCallReject(call: IncomingCallPayload) {
    if (!this.userId) return;
    this.signaling.emit("call-reject", {
      roomId: call.roomId,
      calleeId: this.userId,
      callerId: call.callerId,
    });
  }
}
