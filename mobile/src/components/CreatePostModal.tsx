import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { musicAPI, tvAPI } from "../lib/api";
import { imageAssetToUploadFile, fileNameFromUri, guessVideoMime } from "../lib/mediaUpload";
import { SITE_ORIGIN } from "../constants/site";
import { appTypography, socialTheme } from "../theme/socialTheme";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful post (and on close). */
  onCreated?: () => void;
};

function parseHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}

// Backend only persists hashtags on text posts; embed tags in caption for media.
function buildCaption(subject: string, tags: string[]): string | undefined {
  const s = subject.trim();
  const tagStr = tags.map((t) => (t.startsWith("#") ? t : "#" + t)).join(" ");
  const out = [s, tagStr].filter(Boolean).join(" ").trim();
  return out || undefined;
}

const LIVE_URL = SITE_ORIGIN + "/morongwa-tv/live";

export function CreatePostModal({ visible, onClose, onCreated }: Props) {
  const [heading, setHeading] = useState("");
  const [subject, setSubject] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const [posting, setPosting] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const reset = useCallback(() => {
    setHeading("");
    setSubject("");
    setHashtagsInput("");
    setPosting(false);
    setBusyLabel(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const tags = () => parseHashtags(hashtagsInput);

  const submitTextPost = async () => {
    const h = heading.trim();
    const s = subject.trim();
    const t = tags();
    if (!h && !s && t.length === 0) {
      Alert.alert("Create post", "Add a heading, some text, or at least one hashtag.");
      return;
    }
    setPosting(true);
    try {
      await tvAPI.createPost({
        type: "text",
        heading: h || undefined,
        subject: s || undefined,
        hashtags: t.length ? t : undefined
      });
      Alert.alert("Posted", "Your post was published.");
      reset();
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not create post.";
      Alert.alert("Create post", String(msg));
    } finally {
      setPosting(false);
    }
  };

  const ensureLibraryPermission = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== ImagePicker.PermissionStatus.GRANTED) {
      Alert.alert("Permission needed", "Allow photo library access to attach images or videos.");
      return false;
    }
    return true;
  };

  const uploadThenCreate = async (
    label: string,
    run: () => Promise<void>
  ) => {
    if (posting) return;
    setPosting(true);
    setBusyLabel(label);
    try {
      await run();
      Alert.alert("Posted", "Your post was published.");
      reset();
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        "Could not create post.";
      Alert.alert("Create post", String(msg));
    } finally {
      setPosting(false);
      setBusyLabel(null);
    }
  };

  const onPickVideo = async (qwertz: boolean) => {
    if (!(await ensureLibraryPermission())) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    const name = asset.fileName || fileNameFromUri(asset.uri, "upload.mp4");
    const type = asset.mimeType || guessVideoMime(name);
    const file = { uri: asset.uri, name, type, webFile: (asset as any).file };

    await uploadThenCreate(qwertz ? "Publishing Qwertz..." : "Publishing video...", async () => {
      const up = await tvAPI.uploadMedia(file);
      const caption = buildCaption(subject, tags());
      const anySensitive = !!up.data?.sensitive;
      await tvAPI.createPost({
        type: "video",
        mediaUrls: [up.data.url],
        caption,
        heading: heading.trim() || undefined,
        genre: qwertz ? "qwertz" : undefined,
        sensitive: anySensitive
      });
    });
  };

  const onPickImages = async () => {
    if (!(await ensureLibraryPermission())) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.92
    });
    if (picked.canceled || !picked.assets?.length) return;
    const files = picked.assets.map((a, i) => imageAssetToUploadFile(a, "image-" + (i + 1) + ".jpg"));

    await uploadThenCreate("Publishing images...", async () => {
      const up = await tvAPI.uploadImages(files);
      const urls = up.data?.urls || [];
      if (!urls.length) throw new Error("Upload returned no URLs.");
      const caption = buildCaption(subject, tags());
      const anySensitive = !!up.data?.sensitive;
      await tvAPI.createPost({
        type: urls.length > 1 ? "carousel" : "image",
        mediaUrls: urls,
        caption,
        heading: heading.trim() || undefined,
        sensitive: anySensitive
      });
    });
  };

  const onPickAudio = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["audio/*", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/wav"],
      copyToCacheDirectory: true,
      multiple: false
    });
    if (picked.canceled) return;
    const asset = "assets" in picked && picked.assets?.[0] ? picked.assets[0] : null;
    const legacyUri = !asset && "uri" in picked ? (picked as { uri?: string }).uri : undefined;
    const uri = asset?.uri || legacyUri;
    if (!uri) {
      Alert.alert("Audio", "Could not read the selected file.");
      return;
    }
    const name = asset?.name || fileNameFromUri(uri, "audio.m4a");
    const type = asset?.mimeType || "audio/mpeg";
    const webFile = (asset as any)?.file;

    let artworkUrl: string | undefined;
    if (await ensureLibraryPermission()) {
      const art = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9
      });
      if (!art.canceled && art.assets?.[0]) {
        const img = imageAssetToUploadFile(art.assets[0], "artwork.jpg");
        const upArt = await tvAPI.uploadMedia(img);
        artworkUrl = upArt.data?.url;
      }
    }

    await uploadThenCreate("Publishing audio...", async () => {
      const payload = { uri, name, type, webFile };
      const up = await musicAPI.uploadAudio(payload);
      const audioUrl = up.data?.data?.url;
      if (!audioUrl) throw new Error("Audio upload failed.");
      const caption = buildCaption(subject, tags());
      await tvAPI.createPost({
        type: "audio",
        mediaUrls: [audioUrl],
        caption,
        heading: heading.trim() || undefined,
        artworkUrl,
        sensitive: false
      });
    });
  };

  const onGoLive = () => {
    void Linking.openURL(LIVE_URL).catch(() => {
      Alert.alert("Go live", "Could not open the live page.");
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.dimTap}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss create post"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Create post</Text>
              <Pressable onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={26} color={socialTheme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.fieldRow}>
                <View style={styles.plusCircle}>
                  <Ionicons name="add" size={22} color="#ffffff" />
                </View>
                <View style={styles.fields}>
                  <TextInput
                    value={heading}
                    onChangeText={setHeading}
                    placeholder="Heading"
                    placeholderTextColor={socialTheme.textMuted}
                    style={styles.input}
                  />
                  <TextInput
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="What's on your mind?"
                    placeholderTextColor={socialTheme.textMuted}
                    style={[styles.input, styles.inputTall]}
                    multiline
                  />
                  <TextInput
                    value={hashtagsInput}
                    onChangeText={setHashtagsInput}
                    placeholder="#hashtags"
                    placeholderTextColor={socialTheme.textMuted}
                    style={styles.input}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <Pressable
                onPress={() => void submitTextPost()}
                disabled={posting}
                style={[styles.postBtn, posting && styles.postBtnDisabled]}
              >
                {posting && !busyLabel ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.postBtnText}>Post text</Text>
                )}
              </Pressable>

              <Text style={styles.shortcutsLabel}>Add to your post</Text>
              <View style={styles.shortcutsRow}>
                <Shortcut
                  icon="videocam-outline"
                  label="Video"
                  disabled={posting}
                  onPress={() => void onPickVideo(false)}
                />
                <Shortcut
                  icon="star-outline"
                  label="Qwertz"
                  disabled={posting}
                  onPress={() => void onPickVideo(true)}
                />
                <Shortcut icon="images-outline" label="Images" disabled={posting} onPress={() => void onPickImages()} />
                <Shortcut icon="radio-outline" label="Go live" disabled={posting} onPress={onGoLive} />
                <Shortcut
                  icon="musical-notes-outline"
                  label="Post Audio"
                  disabled={posting}
                  onPress={() => void onPickAudio()}
                />
              </View>

              {posting && busyLabel ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator color={socialTheme.brandBlue} />
                  <Text style={styles.busyText}>{busyLabel}</Text>
                </View>
              ) : null}

              <Text style={styles.hint}>
                Video and images are uploaded to the server, scanned for safety, then published. Audio uses the music
                upload endpoint. For long-form editing or live streaming, use Go live (opens the site).
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
  disabled
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.shortcut, disabled && styles.shortcutDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.shortcutIconWrap}>
        <Ionicons name={icon} size={22} color={socialTheme.brandBlueDark} />
      </View>
      <Text style={styles.shortcutLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  dimTap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)"
  },
  sheetWrap: {
    width: "100%",
    maxHeight: "92%"
  },
  sheet: {
    backgroundColor: socialTheme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "92%",
    paddingBottom: Platform.OS === "ios" ? 28 : 16
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: socialTheme.borderHairline
  },
  title: {
    ...appTypography.titleMd,
    color: socialTheme.textPrimary
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 24
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  plusCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center"
  },
  fields: {
    flex: 1,
    gap: 10,
    minWidth: 0
  },
  input: {
    ...appTypography.input,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: socialTheme.textPrimary,
    backgroundColor: socialTheme.canvas
  },
  inputTall: {
    minHeight: 100,
    textAlignVertical: "top"
  },
  postBtn: {
    backgroundColor: socialTheme.brandBlue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  postBtnDisabled: {
    opacity: 0.7
  },
  postBtnText: {
    ...appTypography.cta,
    color: "#ffffff"
  },
  shortcutsLabel: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    marginTop: 4
  },
  shortcutsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between"
  },
  shortcut: {
    width: "18%",
    minWidth: 56,
    alignItems: "center",
    gap: 6
  },
  shortcutDisabled: {
    opacity: 0.5
  },
  shortcutIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: socialTheme.surfaceMuted
  },
  shortcutLabel: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary,
    textAlign: "center"
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4
  },
  busyText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    flex: 1
  },
  hint: {
    ...appTypography.meta,
    color: socialTheme.textMuted,
    lineHeight: 18
  }
});
