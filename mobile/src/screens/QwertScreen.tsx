import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { qwertzAPI } from "../lib/api";
import { socialTheme } from "../theme/socialTheme";

type Props = {
  onBack: () => void;
};

/** Phase 1 stub — calls Qwertymates /api/qwertz proxy (Qwertz service backend). */
export function QwertScreen({ onBack }: Props) {
  const [status, setStatus] = useState("Checking Qwertz…");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    qwertzAPI
      .health()
      .then((res) => {
        const ff = res.data?.ffmpeg?.ok ? "FFmpeg ready" : "FFmpeg not on Qwertz host";
        setStatus(`${res.data?.status || "ok"} · ${ff}`);
      })
      .catch(() => setStatus("Qwertz unavailable — start Qwertz service + QWERTZ_API_URL"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Qwertz Editor</Text>
      <Text style={styles.sub}>Video Editing Suite (Phase 1)</Text>
      {loading ? (
        <ActivityIndicator color={socialTheme.brandBlue} />
      ) : (
        <Text style={styles.status}>{status}</Text>
      )}
      <Text style={styles.hint}>
        Upload and trim from Create → Qwertz on the Wall, or use the web editor at /qwert.
      </Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12, backgroundColor: socialTheme.canvas },
  title: { fontSize: 22, fontWeight: "700", color: socialTheme.textPrimary },
  sub: { fontSize: 14, color: socialTheme.textSecondary },
  status: { fontSize: 13, color: socialTheme.textPrimary },
  hint: { fontSize: 13, color: socialTheme.textSecondary, lineHeight: 20 },
  backBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: socialTheme.brandBlue
  },
  backText: { color: "#fff", fontWeight: "600" }
});
