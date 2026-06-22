import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

/**
 * Android uses the system Photo Picker — READ_MEDIA_* is blocked in app.json (Play policy).
 * Do not call requestMediaLibraryPermissionsAsync on Android or gallery pickers never open.
 */
export async function ensureMediaLibraryAccess(): Promise<boolean> {
  if (Platform.OS === "android") return true;
  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return !!(result.granted || result.status === ImagePicker.PermissionStatus.GRANTED);
}

export async function ensureCameraAccess(): Promise<boolean> {
  const result = await ImagePicker.requestCameraPermissionsAsync();
  return !!(result.granted || result.status === ImagePicker.PermissionStatus.GRANTED);
}
