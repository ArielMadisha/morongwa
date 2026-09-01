import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";
import { requestOpenErrands, emitNewShopOrderAlert } from "./errandsNavigation";

const ANDROID_CHANNEL_ID = "shop-orders";

/** Show alerts while the app is foregrounded (store owners need to hear new orders). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let lastRegisteredToken: string | null = null;
let responseSub: Notifications.Subscription | null = null;
let receivedSub: Notifications.Subscription | null = null;

function easProjectId(): string | undefined {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const id = String(fromExtra || fromEas || "").trim();
  return id || undefined;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Shop orders",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0EA5E9",
    sound: "default",
  });
}

/**
 * Request permission, obtain Expo push token, and POST it to the backend.
 * Safe to call repeatedly after login — upserts the token server-side.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      return null;
    }

    await ensureAndroidChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return null;
    }

    const projectId = easProjectId();
    if (!projectId) {
      console.warn("[push] Missing EAS projectId — cannot get Expo push token");
      return null;
    }

    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = String(tokenRes?.data || "").trim();
    if (!token) return null;

    await api.post("/notifications/push-token", {
      token,
      platform: Platform.OS,
      deviceId: Device.modelName || undefined,
    });
    lastRegisteredToken = token;
    return token;
  } catch (err) {
    console.warn("[push] Registration failed", err);
    return null;
  }
}

/** Best-effort remove token on logout so the device stops receiving pushes for this account. */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    const token =
      lastRegisteredToken ||
      (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId() }).then(
        (r) => String(r?.data || "").trim(),
        () => ""
      ));
    if (!token) return;
    await api.delete("/notifications/push-token", { data: { token } });
  } catch {
    /* ignore — logout must proceed */
  } finally {
    lastRegisteredToken = null;
  }
}

function isShopOrderPush(data: Record<string, unknown> | undefined): boolean {
  if (!data || typeof data !== "object") return false;
  const type = String(data.type || "");
  return type === "food_shop_order" || type === "shop_order";
}

function openFromNotificationData(data: Record<string, unknown> | undefined): void {
  if (!isShopOrderPush(data)) return;
  requestOpenErrands({ tab: "orders" });
}

/**
 * Listen for notification taps (cold start + background) and foreground shop-order pushes.
 * Opens the in-app Errands Orders hub. Call once while authenticated; returns cleanup.
 */
export function attachPushNotificationListeners(): () => void {
  if (responseSub) {
    responseSub.remove();
    responseSub = null;
  }
  if (receivedSub) {
    receivedSub.remove();
    receivedSub = null;
  }

  responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    openFromNotificationData(data);
  });

  receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    if (!isShopOrderPush(data)) return;
    emitNewShopOrderAlert();
  });

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    openFromNotificationData(data);
  });

  return () => {
    responseSub?.remove();
    responseSub = null;
    receivedSub?.remove();
    receivedSub = null;
  };
}
