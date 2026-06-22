import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { errandsTshwaneAPI, type TshwaneRegionRow, type TshwaneTownshipRow } from "../lib/api";
import { User } from "../types";
import { appTypography, socialTheme } from "../theme/socialTheme";

type FlowKind = "local" | "transport";

function userHasClientRole(user: User | null | undefined): boolean {
  if (!user?.role) return false;
  const r = user.role;
  return Array.isArray(r) ? r.includes("client") : r === "client";
}

export function ErrandsTshwaneBookModal(props: {
  visible: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const { visible, onClose, user } = props;
  const [loadingCov, setLoadingCov] = useState(false);
  const [regions, setRegions] = useState<TshwaneRegionRow[]>([]);
  const [townships, setTownships] = useState<TshwaneTownshipRow[]>([]);
  const [kind, setKind] = useState<FlowKind>("local");

  const [puRegion, setPuRegion] = useState<string | null>(null);
  const [puTown, setPuTown] = useState<string | null>(null);
  const [drRegion, setDrRegion] = useState<string | null>(null);
  const [drTown, setDrTown] = useState<string | null>(null);
  const [localService, setLocalService] = useState<"small_parcel" | "food" | "medium_parcel" | "large_parcel">("food");
  const [peak, setPeak] = useState(false);
  const [pickupAddr, setPickupAddr] = useState("");
  const [deliveryAddr, setDeliveryAddr] = useState("");
  const [deliveryLat, setDeliveryLat] = useState("");
  const [deliveryLng, setDeliveryLng] = useState("");

  const [vehicle, setVehicle] = useState<"bakkie" | "small_truck">("bakkie");
  const [loadKg, setLoadKg] = useState("");

  const [quoteText, setQuoteText] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [bookBusy, setBookBusy] = useState(false);

  const reset = useCallback(() => {
    setPuRegion(null);
    setPuTown(null);
    setDrRegion(null);
    setDrTown(null);
    setLocalService("food");
    setPeak(false);
    setPickupAddr("");
    setDeliveryAddr("");
    setDeliveryLat("");
    setDeliveryLng("");
    setVehicle("bakkie");
    setLoadKg("");
    setQuoteText(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    reset();
    setLoadingCov(true);
    void errandsTshwaneAPI
      .getCoverage()
      .then((res) => {
        setRegions(res.data?.regions ?? []);
        setTownships(res.data?.townships ?? []);
      })
      .catch(() => {
        setRegions([]);
        setTownships([]);
        Alert.alert("Errands", "Could not load coverage areas. Try again later.");
      })
      .finally(() => setLoadingCov(false));
  }, [visible, reset]);

  const puTowns = useMemo(
    () => (puRegion ? townships.filter((t) => t.regionId === puRegion) : []),
    [townships, puRegion]
  );
  const drTowns = useMemo(
    () => (drRegion ? townships.filter((t) => t.regionId === drRegion) : []),
    [townships, drRegion]
  );

  const canQuoteLocal = Boolean(puTown && drTown && pickupAddr.trim().length >= 8);
  const canQuoteTransport = Boolean(
    puTown && drTown && pickupAddr.trim().length >= 8 && deliveryAddr.trim().length >= 8 && Number(loadKg) > 0
  );

  const runQuote = async () => {
    if (!puTown || !drTown) return;
    setQuoteBusy(true);
    setQuoteText(null);
    try {
      if (kind === "local") {
        const res = await errandsTshwaneAPI.quote({
          kind: "local",
          localServiceKey: localService,
          pickupTownshipId: puTown,
          deliveryTownshipId: drTown,
          peakHours: peak,
        });
        const q = res.data?.quote as { customerTotal?: number } | undefined;
        setQuoteText(
          q && typeof q.customerTotal === "number" ? `Estimated total: R${q.customerTotal}` : JSON.stringify(res.data?.quote)
        );
      } else {
        const res = await errandsTshwaneAPI.quote({
          kind: "transport",
          loadKg: Number(loadKg),
          pickupTownshipId: puTown,
          deliveryTownshipId: drTown,
          peakHours: peak,
        });
        const q = res.data?.quote as { customerTotal?: number } | undefined;
        setQuoteText(
          q && typeof q.customerTotal === "number" ? `Estimated total: R${q.customerTotal}` : JSON.stringify(res.data?.quote)
        );
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (e as Error)?.message ||
        "Quote failed";
      Alert.alert("Quote", String(msg));
    } finally {
      setQuoteBusy(false);
    }
  };

  const runBook = async () => {
    if (!userHasClientRole(user)) {
      Alert.alert("Errands", "Your account needs the Client role to post errands from the app.");
      return;
    }
    if (!puTown || !drTown) return;
    setBookBusy(true);
    try {
      if (kind === "local") {
        const lat = Number(deliveryLat);
        const lng = Number(deliveryLng);
        const body: Record<string, unknown> = {
          kind: "local",
          localServiceKey: localService,
          pickupTownshipId: puTown,
          deliveryTownshipId: drTown,
          peakHours: peak,
          pickup: pickupAddr.trim(),
          delivery: deliveryAddr.trim(),
        };
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          body.deliveryLatitude = lat;
          body.deliveryLongitude = lng;
        }
        const res = await errandsTshwaneAPI.book(body);
        Alert.alert("Booked", `Task #${String(res.data?.task?._id || "").slice(-6)} — est. R${res.data?.estimate ?? ""}`);
        onClose();
      } else {
        const res = await errandsTshwaneAPI.book({
          kind: "transport",
          vehicleType: vehicle,
          loadKg: Number(loadKg),
          pickupTownshipId: puTown,
          deliveryTownshipId: drTown,
          peakHours: peak,
          pickup: pickupAddr.trim(),
          delivery: deliveryAddr.trim(),
          photoProvided: false,
        });
        Alert.alert("Booked", `Task #${String(res.data?.task?._id || "").slice(-6)} — est. R${res.data?.estimate ?? ""}`);
        onClose();
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (e as Error)?.message ||
        "Booking failed";
      Alert.alert("Book", String(msg));
    } finally {
      setBookBusy(false);
    }
  };

  const quoteDisabled =
    quoteBusy ||
    (kind === "local" ? !canQuoteLocal : !canQuoteTransport || !deliveryAddr.trim());

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Tshwane errands</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          {!userHasClientRole(user) ? (
            <Text style={styles.warn}>Sign in with a Client account to book. Runner-only accounts cannot post tasks.</Text>
          ) : null}
          {loadingCov ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={socialTheme.brandBlue} />
          ) : (
            <ScrollView style={{ maxHeight: "88%" }} keyboardShouldPersistTaps="handled">
              <Text style={styles.section}>Type</Text>
              <View style={styles.row}>
                <Pressable
                  style={[styles.chip, kind === "local" && styles.chipOn]}
                  onPress={() => {
                    setKind("local");
                    setQuoteText(null);
                  }}
                >
                  <Text style={styles.chipText}>Local errand</Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, kind === "transport" && styles.chipOn]}
                  onPress={() => {
                    setKind("transport");
                    setQuoteText(null);
                  }}
                >
                  <Text style={styles.chipText}>Large transport</Text>
                </Pressable>
              </View>

              {kind === "transport" ? (
                <>
                  <Text style={styles.section}>Vehicle</Text>
                  <View style={styles.row}>
                    <Pressable style={[styles.chip, vehicle === "bakkie" && styles.chipOn]} onPress={() => setVehicle("bakkie")}>
                      <Text style={styles.chipText}>Bakkie</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chip, vehicle === "small_truck" && styles.chipOn]}
                      onPress={() => setVehicle("small_truck")}
                    >
                      <Text style={styles.chipText}>Small truck</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.section}>Load (kg)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 85"
                    value={loadKg}
                    onChangeText={setLoadKg}
                  />
                </>
              ) : null}

              {kind === "local" ? (
                <>
                  <Text style={styles.section}>Service</Text>
                  {(
                    [
                      ["small_parcel", "Small parcel — R25"],
                      ["food", "Food — R30"],
                      ["medium_parcel", "Medium parcel — R40"],
                      ["large_parcel", "Large parcel — R60"],
                    ] as const
                  ).map(([k, label]) => (
                    <Pressable key={k} style={[styles.opt, localService === k && styles.optOn]} onPress={() => setLocalService(k)}>
                      <Text style={styles.optText}>{label}</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}

              <Text style={styles.section}>Pickup area</Text>
              <Text style={styles.hint}>Region, then township</Text>
              <View style={styles.wrap}>
                {regions.map((r) => (
                  <Pressable key={r.id} style={[styles.mini, puRegion === r.id && styles.miniOn]} onPress={() => setPuRegion(r.id)}>
                    <Text style={styles.miniText}>{r.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.wrap}>
                {puTowns.map((t) => (
                  <Pressable key={t.id} style={[styles.mini, puTown === t.id && styles.miniOn]} onPress={() => setPuTown(t.id)}>
                    <Text style={styles.miniText}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.section}>Delivery area</Text>
              <View style={styles.wrap}>
                {regions.map((r) => (
                  <Pressable key={`d-${r.id}`} style={[styles.mini, drRegion === r.id && styles.miniOn]} onPress={() => setDrRegion(r.id)}>
                    <Text style={styles.miniText}>{r.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.wrap}>
                {drTowns.map((t) => (
                  <Pressable key={`dt-${t.id}`} style={[styles.mini, drTown === t.id && styles.miniOn]} onPress={() => setDrTown(t.id)}>
                    <Text style={styles.miniText}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.section}>Peak / weekend surcharge?</Text>
              <View style={styles.row}>
                <Pressable style={[styles.chip, peak && styles.chipOn]} onPress={() => setPeak(true)}>
                  <Text style={styles.chipText}>Yes</Text>
                </Pressable>
                <Pressable style={[styles.chip, !peak && styles.chipOn]} onPress={() => setPeak(false)}>
                  <Text style={styles.chipText}>No</Text>
                </Pressable>
              </View>

              <Text style={styles.section}>Pickup address (required)</Text>
              <TextInput
                style={styles.input}
                placeholder="Shop / mall + street (12+ chars, 2+ words)"
                value={pickupAddr}
                onChangeText={setPickupAddr}
                multiline
              />

              <Text style={styles.section}>{kind === "transport" ? "Drop-off address (required)" : "Delivery (required)"}</Text>
              {kind === "local" ? (
                <Text style={styles.hint}>Full address — or enter GPS pin (both lat and lng).</Text>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder={kind === "transport" ? "Street / landmark (8+ chars)" : "Street, gate, building (16+ chars, 2+ words) if not using pin"}
                value={deliveryAddr}
                onChangeText={setDeliveryAddr}
                multiline
              />
              {kind === "local" ? (
                <>
                  <Text style={styles.hint}>Optional pin: latitude / longitude</Text>
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Lat"
                      value={deliveryLat}
                      onChangeText={setDeliveryLat}
                      keyboardType="numbers-and-punctuation"
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Lng"
                      value={deliveryLng}
                      onChangeText={setDeliveryLng}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </>
              ) : null}

              {quoteText ? <Text style={styles.quote}>{quoteText}</Text> : null}

              <View style={styles.actions}>
                <Pressable style={[styles.btn, quoteDisabled ? styles.btnOff : null]} disabled={quoteDisabled} onPress={() => void runQuote()}>
                  {quoteBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Get quote</Text>}
                </Pressable>
                <Pressable style={[styles.btn, styles.btnDark]} disabled={bookBusy || !quoteText} onPress={() => void runBook()}>
                  {bookBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Confirm & book</Text>}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: socialTheme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: "92%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    ...appTypography.headline,
    color: socialTheme.textPrimary,
  },
  close: {
    ...appTypography.titleSm,
    color: socialTheme.brandBlue,
    fontWeight: "700",
  },
  warn: {
    ...appTypography.meta,
    color: "#b45309",
    marginBottom: 8,
  },
  section: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary,
    marginTop: 12,
    marginBottom: 6,
    fontWeight: "700",
  },
  hint: {
    ...appTypography.meta,
    color: socialTheme.textMuted,
    marginBottom: 6,
  },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f8fafc",
  },
  chipOn: { borderColor: socialTheme.brandBlue, backgroundColor: "#eaf0ff" },
  chipText: { ...appTypography.titleSm, color: socialTheme.textPrimary },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mini: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
  },
  miniOn: { borderColor: socialTheme.brandBlue, backgroundColor: "#eaf0ff" },
  miniText: { ...appTypography.meta, color: socialTheme.textPrimary, maxWidth: 120 },
  opt: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  optOn: { borderColor: socialTheme.brandBlue, backgroundColor: "#eaf0ff" },
  optText: { ...appTypography.titleSm, color: socialTheme.textPrimary },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...appTypography.input,
    color: socialTheme.textPrimary,
    minHeight: 44,
    textAlignVertical: "top",
  },
  quote: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary,
    marginTop: 10,
    fontWeight: "700",
  },
  actions: { gap: 10, marginTop: 16, marginBottom: 24 },
  btn: {
    backgroundColor: socialTheme.brandBlue,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnDark: { backgroundColor: "#0f172a" },
  btnOff: { opacity: 0.45 },
  btnText: { ...appTypography.cta, color: "#ffffff" },
});
