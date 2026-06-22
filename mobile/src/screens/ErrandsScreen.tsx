import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Location from "expo-location";
import { useAuth } from "../contexts/AuthContext";
import { tasksAPI } from "../lib/api";
import { openWebUrl } from "../lib/openWebUrl";
import {
  ERRANDS_ANDROID_PLAY_URL,
  ERRANDS_DASHBOARD_URL,
  ERRANDS_POPULAR_ROUTES
} from "../content/errandsMarketing";
import { Role, Task } from "../types";
import { appTypography, socialTheme } from "../theme/socialTheme";

type ErrandsMode = "client" | "runner";

type ErrandsScreenProps = {
  mode: ErrandsMode;
  onBack: () => void;
};

function hasRole(roles: Role[] | Role | undefined, role: Role): boolean {
  if (!roles) return false;
  if (Array.isArray(roles)) return roles.includes(role);
  return roles === role;
}

function toTaskArray(payload: unknown): Task[] {
  if (Array.isArray(payload)) return payload as Task[];
  if (payload && typeof payload === "object") {
    const row = payload as { data?: unknown; tasks?: unknown };
    if (Array.isArray(row.data)) return row.data as Task[];
    if (Array.isArray(row.tasks)) return row.tasks as Task[];
  }
  return [];
}

export function ErrandsScreen({ mode, onBack }: ErrandsScreenProps) {
  const { user } = useAuth();
  const isClient = hasRole(user?.role, "client");
  const isRunner = hasRole(user?.role, "runner");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [arrivalLat, setArrivalLat] = useState("");
  const [arrivalLon, setArrivalLon] = useState("");
  const [arrivalCheckingTaskId, setArrivalCheckingTaskId] = useState<string | null>(null);
  const [arrivalInfo, setArrivalInfo] = useState<Record<string, { atDestination?: boolean; message?: string }>>({});
  const [gpsBusy, setGpsBusy] = useState(false);

  const canUseClient = mode === "client" && isClient;
  const canUseRunner = mode === "runner" && isRunner;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if ((mode === "client" && !isClient) || (mode === "runner" && !isRunner)) {
      setMyTasks([]);
      setAvailableTasks([]);
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    try {
      if (mode === "client") {
        const mine = await tasksAPI.getMine();
        setMyTasks(toTaskArray(mine.data));
        setAvailableTasks([]);
      } else {
        const [mineAccepted, available] = await Promise.all([tasksAPI.getMyAccepted(), tasksAPI.getAvailable()]);
        setMyTasks(toTaskArray(mineAccepted.data));
        setAvailableTasks(toTaskArray(available.data));
      }
      setLastUpdatedAt(new Date());
    } catch {
      if (!opts?.silent) {
        setMyTasks([]);
        setAvailableTasks([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [mode, isClient, isRunner]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const id = setInterval(() => {
      void load({ silent: true });
    }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  };

  const statusColor = (status: Task["status"]) => {
    if (status === "completed") return "#15803d";
    if (status === "cancelled") return "#b91c1c";
    if (status === "in_progress") return "#1d4ed8";
    if (status === "accepted") return "#92400e";
    return "#334155";
  };

  const createTask = async () => {
    if (submitting) return;
    const nextTitle = title.trim();
    const nextDesc = description.trim();
    const nextBudget = Number(budget);
    if (!nextTitle || !nextDesc || !Number.isFinite(nextBudget) || nextBudget < 1) {
      Alert.alert("Errands", "Title, description and budget are required.");
      return;
    }
    try {
      setSubmitting(true);
      await tasksAPI.create({
        title: nextTitle,
        description: nextDesc,
        budget: nextBudget,
        pickupLocation: { type: "Point", coordinates: [0, 0], address: pickupAddress.trim() || "Pickup" },
        deliveryLocation: { type: "Point", coordinates: [0, 0], address: deliveryAddress.trim() || "Delivery" }
      });
      setTitle("");
      setDescription("");
      setBudget("");
      setPickupAddress("");
      setDeliveryAddress("");
      Alert.alert("Errands", "Task created.");
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Could not create task.";
      Alert.alert("Errands", String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const runTaskAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    if (submitting) return;
    try {
      setSubmitting(true);
      await fn();
      Alert.alert("Errands", okMsg);
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ||
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error ||
        (err as Error)?.message ||
        "Action failed.";
      Alert.alert("Errands", String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const mineTitle = useMemo(
    () => (mode === "client" ? "My client tasks" : "My accepted/in-progress"),
    [mode]
  );

  const fillArrivalFromGps = async () => {
    if (gpsBusy) return;
    setGpsBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Location", "Allow location while using the app so we can check arrival at the drop-off.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setArrivalLat(String(pos.coords.latitude));
      setArrivalLon(String(pos.coords.longitude));
    } catch {
      Alert.alert("Location", "Could not read GPS. Enter latitude and longitude manually.");
    } finally {
      setGpsBusy(false);
    }
  };

  const checkArrival = async (taskId: string) => {
    const lat = Number(arrivalLat);
    const lon = Number(arrivalLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      Alert.alert("Arrival check", "Enter valid latitude and longitude first.");
      return;
    }
    try {
      setArrivalCheckingTaskId(taskId);
      const res = await tasksAPI.checkArrival(taskId, lat, lon);
      const data = res.data || {};
      setArrivalInfo((prev) => ({
        ...prev,
        [taskId]: { atDestination: !!data.atDestination, message: data.message || undefined }
      }));
      Alert.alert("Arrival check", data.message || (data.atDestination ? "At destination." : "Not at destination yet."));
      await load({ silent: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ||
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error ||
        (err as Error)?.message ||
        "Could not check arrival.";
      Alert.alert("Arrival check", String(msg));
    } finally {
      setArrivalCheckingTaskId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={socialTheme.brandBlue} />
        <Text style={styles.hint}>Loading errands…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.topRow}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{mode === "client" ? "Client errands" : "Runner errands"}</Text>
      </View>
      <Text style={styles.lastUpdatedText}>
        Last updated: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : "just now"} (auto refresh 20s)
      </Text>

      <View style={styles.introCard}>
        <Text style={styles.introTitle}>📦 Qwertymates Errands</Text>
        <Text style={styles.introLead}>Your trusted errands partner in Southern Africa</Text>
        <Text style={styles.introSectionHead}>✅ In South Africa</Text>
        <Text style={styles.introBody}>
          We assist with deliveries and collections, transporting large items (fridges, drums, furniture), and
          connecting you with reliable local runners.
        </Text>
        <Text style={styles.introSectionHead}>✅ Across Borders</Text>
        <Text style={styles.introBody}>
          Buy in South Africa and let us handle the rest — we collect your goods and send them safely to Botswana,
          Lesotho, Zimbabwe, Mozambique & more (taxi, bus, courier, or border drop-off).
        </Text>
        <Text style={styles.introSectionHead}>🚛 Safe Transport for Large Items</Text>
        <Text style={styles.introBody}>Move bulky goods with confidence — handled by trusted runners.</Text>
        <Text style={styles.introSectionHead}>🌍 Popular Routes</Text>
        {ERRANDS_POPULAR_ROUTES.map((route) => (
          <Text key={route} style={styles.introBullet}>
            • {route}
          </Text>
        ))}
        <Text style={styles.introProcess}>
          💡 Simple process: You order → We collect → We deliver safely
        </Text>
        <Text style={styles.introCtaLabel}>👇 Continue with Qwertymates Errands:</Text>
        <Pressable
          onPress={() => {
            void openWebUrl(ERRANDS_DASHBOARD_URL).catch(() => {
              Alert.alert("Errands", "Could not open Qwertymates Dashboard.");
            });
          }}
          accessibilityRole="link"
          accessibilityLabel="Qwertymates Dashboard"
        >
          <Text style={styles.introLink}>Qwertymates Dashboard</Text>
        </Pressable>
        <Text style={styles.introCtaLabel}>👇 Or download our mobile apps:</Text>
        <Pressable
          onPress={() => {
            void Linking.openURL(ERRANDS_ANDROID_PLAY_URL).catch(() => {
              Alert.alert("Errands", "Could not open Google Play.");
            });
          }}
          accessibilityRole="link"
          accessibilityLabel="Android App on Google Play"
          style={styles.playBadgeWrap}
        >
          <Image
            source={{
              uri: "https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
            }}
            style={styles.playBadge}
            resizeMode="contain"
          />
        </Pressable>
        {mode === "client" ? (
          <Text style={styles.introModeHint}>
            Post errands below — funds stay in escrow until your runner completes the task.
          </Text>
        ) : (
          <Text style={styles.introModeHint}>
            Browse and accept open errands below — same flow as the website runner dashboard.
          </Text>
        )}
      </View>

      {mode === "runner" && !isRunner ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Become a runner</Text>
          <Text style={styles.hint}>
            Your account does not have the Runner role yet. Apply on the website to upload ID, vehicle, and verification documents.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              void openWebUrl("/runner/apply").catch(() => {
                Alert.alert("Errands", "Could not open the runner application page.");
              });
            }}
          >
            <Text style={styles.primaryBtnText}>Apply to become a runner</Text>
          </Pressable>
        </View>
      ) : null}

      {mode === "client" && !isClient ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Client account required</Text>
          <Text style={styles.hint}>
            Sign in with a Client account to post errands from the app. Use Book (Tshwane) from the errands menu for City of Tshwane pricing.
          </Text>
        </View>
      ) : null}

      {mode === "client" && isClient ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Create task</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Task title" />
          <TextInput
            style={[styles.input, styles.inputTall]}
            value={description}
            onChangeText={setDescription}
            placeholder="Task description"
            multiline
          />
          <TextInput
            style={styles.input}
            value={budget}
            onChangeText={setBudget}
            placeholder="Budget (ZAR)"
            keyboardType="numeric"
          />
          <TextInput
            style={styles.input}
            value={pickupAddress}
            onChangeText={setPickupAddress}
            placeholder="Pickup address (optional)"
          />
          <TextInput
            style={styles.input}
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            placeholder="Delivery address (optional)"
          />
          <Pressable style={styles.primaryBtn} onPress={() => void createTask()} disabled={submitting}>
            <Text style={styles.primaryBtnText}>{submitting ? "Please wait…" : "Create task"}</Text>
          </Pressable>
        </View>
      ) : null}

      {(canUseClient || canUseRunner) ? (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{mineTitle}</Text>
        {myTasks.length === 0 ? (
          <Text style={styles.hint}>No tasks yet.</Text>
        ) : (
          myTasks.map((t) => (
            <View key={t._id} style={styles.taskRow}>
              <Text style={styles.taskTitle}>{t.title}</Text>
              <Text style={[styles.status, { color: statusColor(t.status) }]}>{t.status}</Text>
              <Text style={styles.meta}>R {Number(t.budget || 0).toFixed(2)}</Text>
              {mode === "runner" && t.status === "accepted" ? (
                <Pressable
                  style={styles.smallBtn}
                  onPress={() => void runTaskAction(() => tasksAPI.start(t._id), "Task started.")}
                >
                  <Text style={styles.smallBtnText}>Start</Text>
                </Pressable>
              ) : null}
              {mode === "runner" && (t.status === "accepted" || t.status === "in_progress") ? (
                <Pressable
                  style={styles.smallBtn}
                  onPress={() => void runTaskAction(() => tasksAPI.complete(t._id), "Task completed.")}
                >
                  <Text style={styles.smallBtnText}>Complete</Text>
                </Pressable>
              ) : null}
              {mode === "runner" && t.status === "in_progress" ? (
                <>
                  <Pressable
                    style={styles.smallBtn}
                    onPress={() => void fillArrivalFromGps()}
                    disabled={gpsBusy}
                  >
                    <Text style={styles.smallBtnText}>{gpsBusy ? "Locating…" : "Use current location"}</Text>
                  </Pressable>
                  <View style={styles.arrivalInputsRow}>
                    <TextInput
                      style={[styles.input, styles.arrivalInput]}
                      value={arrivalLat}
                      onChangeText={setArrivalLat}
                      placeholder="Lat"
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.input, styles.arrivalInput]}
                      value={arrivalLon}
                      onChangeText={setArrivalLon}
                      placeholder="Lon"
                      keyboardType="numeric"
                    />
                  </View>
                  <Pressable
                    style={styles.smallBtn}
                    onPress={() => void checkArrival(t._id)}
                    disabled={arrivalCheckingTaskId === t._id}
                  >
                    <Text style={styles.smallBtnText}>
                      {arrivalCheckingTaskId === t._id ? "Checking..." : "Check arrival"}
                    </Text>
                  </Pressable>
                  {arrivalInfo[t._id]?.message ? (
                    <Text style={[styles.meta, arrivalInfo[t._id]?.atDestination ? styles.okText : styles.warnText]}>
                      {arrivalInfo[t._id]?.message}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {mode === "client" && t.status === "completed" && !t.closedAtDestination ? (
                <Pressable
                  style={styles.smallBtn}
                  onPress={() => void runTaskAction(() => tasksAPI.confirmDelivery(t._id), "Delivery confirmed.")}
                >
                  <Text style={styles.smallBtnText}>Confirm delivery</Text>
                </Pressable>
              ) : null}
              {(t.status === "posted" || t.status === "accepted" || t.status === "in_progress") ? (
                <Pressable
                  style={styles.smallBtnGhost}
                  onPress={() => void runTaskAction(() => tasksAPI.cancel(t._id), "Task cancelled.")}
                >
                  <Text style={styles.smallBtnGhostText}>Cancel</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </View>
      ) : null}

      {canUseRunner ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Available tasks</Text>
          {availableTasks.length === 0 ? (
            <Text style={styles.hint}>No open tasks right now.</Text>
          ) : (
            availableTasks.map((t) => (
              <View key={t._id} style={styles.taskRow}>
                <Text style={styles.taskTitle}>{t.title}</Text>
                <Text style={styles.meta}>R {Number(t.budget || 0).toFixed(2)}</Text>
                {t.status === "posted" ? (
                  <Pressable
                    style={styles.smallBtn}
                    onPress={() => void runTaskAction(() => tasksAPI.accept(t._id), "Task accepted.")}
                  >
                    <Text style={styles.smallBtnText}>Accept</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: socialTheme.canvas
  },
  content: {
    padding: 12,
    gap: 10,
    paddingBottom: 28
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  backText: {
    ...appTypography.meta,
    color: socialTheme.brandBlue,
    fontWeight: "700"
  },
  title: {
    ...appTypography.titleMd,
    color: socialTheme.textPrimary
  },
  introCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    backgroundColor: "#ecfdf5"
  },
  introTitle: {
    ...appTypography.titleSm,
    color: "#065f46"
  },
  introLead: {
    ...appTypography.meta,
    color: "#047857",
    fontWeight: "600",
    lineHeight: 20
  },
  introSectionHead: {
    ...appTypography.meta,
    color: "#065f46",
    fontWeight: "700",
    marginTop: 6
  },
  introBody: {
    ...appTypography.meta,
    color: "#047857",
    lineHeight: 20
  },
  introBullet: {
    ...appTypography.meta,
    color: "#047857",
    lineHeight: 20,
    paddingLeft: 4
  },
  introProcess: {
    ...appTypography.meta,
    color: "#065f46",
    fontWeight: "600",
    marginTop: 8,
    lineHeight: 20
  },
  introCtaLabel: {
    ...appTypography.meta,
    color: "#047857",
    marginTop: 10,
    fontWeight: "600"
  },
  introLink: {
    ...appTypography.cta,
    color: "#047857",
    textDecorationLine: "underline",
    marginTop: 4
  },
  playBadgeWrap: {
    marginTop: 8,
    alignSelf: "flex-start"
  },
  playBadge: {
    width: 160,
    height: 48
  },
  introModeHint: {
    ...appTypography.meta,
    color: "#047857",
    marginTop: 10,
    fontStyle: "italic",
    lineHeight: 18
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 12,
    padding: 10,
    gap: 8,
    backgroundColor: socialTheme.surface
  },
  sectionTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  input: {
    borderWidth: 1,
    borderColor: socialTheme.borderHairline,
    borderRadius: 10,
    minHeight: 42,
    paddingHorizontal: 10,
    color: socialTheme.textPrimary,
    backgroundColor: "#fff"
  },
  inputTall: {
    minHeight: 82,
    textAlignVertical: "top",
    paddingVertical: 8
  },
  primaryBtn: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryBtnText: {
    ...appTypography.cta,
    color: "#fff"
  },
  taskRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 10,
    padding: 10,
    gap: 4
  },
  taskTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  status: {
    ...appTypography.meta,
    fontWeight: "700"
  },
  meta: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  hint: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  lastUpdatedText: {
    ...appTypography.meta,
    color: socialTheme.textMuted
  },
  smallBtn: {
    marginTop: 4,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: socialTheme.brandBlueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center"
  },
  smallBtnText: {
    ...appTypography.meta,
    color: socialTheme.brandBlueDark,
    fontWeight: "700"
  },
  smallBtnGhost: {
    marginTop: 4,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center"
  },
  smallBtnGhostText: {
    ...appTypography.meta,
    color: "#b91c1c",
    fontWeight: "700"
  },
  arrivalInputsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  arrivalInput: {
    flex: 1
  },
  okText: {
    color: "#15803d"
  },
  warnText: {
    color: "#92400e"
  }
});
