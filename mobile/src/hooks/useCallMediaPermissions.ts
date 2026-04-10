import { Alert, Linking, PermissionsAndroid, Platform } from "react-native";

/**
 * Android: runtime CAMERA + RECORD_AUDIO.
 * iOS: usage strings in app.json; first getUserMedia shows the system prompt.
 */
export async function ensureCallMediaPermissions(): Promise<boolean> {
  if (Platform.OS === "android") {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA!,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO!,
    ]);
    const cam = results[PermissionsAndroid.PERMISSIONS.CAMERA!];
    const mic = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO!];
    if (cam !== PermissionsAndroid.RESULTS.GRANTED || mic !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert(
        "Camera and microphone",
        "Morongwa needs camera and microphone access for video calls. You can enable them in Settings.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open settings", onPress: () => void Linking.openSettings() },
        ]
      );
      return false;
    }
  }
  return true;
}
