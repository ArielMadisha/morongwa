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
  ToastAndroid,
  View
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { formatApiError, musicAPI, tvAPI } from "../lib/api";
import {
  imageAssetToUploadFile,
  fileNameFromUri,
  guessVideoMime,
  defaultImageUploadName
} from "../lib/mediaUpload";
import { ensureCameraAccess, ensureMediaLibraryAccess } from "../lib/mediaPermissions";
import { SITE_ORIGIN } from "../constants/site";
import { appTypography, socialTheme } from "../theme/socialTheme";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful post (and on close). */
  onCreated?: () => void;
};

type Notice = { tone: "error" | "success"; text: string };
type MediaMenu = "video" | "qwertz" | "images" | null;

/** LiveKit in-app live rooms (not the legacy /morongwa-tv/live listing). */
const LIVE_URL = `${SITE_ORIGIN}/live`;

function parseHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function buildCaption(subject: string, tags: string[]): string | undefined {
  const s = subject.trim();
  const tagStr = tags.map((t) => (t.startsWith("#") ? t : "#" + t)).join(" ");
  const out = [s, tagStr].filter(Boolean).join(" ").trim();
  return out || undefined;
}

function showToast(text: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(text, ToastAndroid.LONG);
  }
}

export function CreatePostModal({ visible, onClose, onCreated }: Props) {
  const [heading, setHeading] = useState("");
  const [subject, setSubject] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const [posting, setPosting] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [mediaMenu, setMediaMenu] = useState<MediaMenu>(null);

  const reset = useCallback(() => {
    setHeading("");
    setSubject("");
    setHashtagsInput("");
    setPosting(false);
    setBusyLabel(null);
    setNotice(null);
    setMediaMenu(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const notify = (tone: Notice["tone"], text: string) => {
    setNotice({ tone, text });
    showToast(text);
  };

  const notifyError = (text: string) => notify("error", text);

  const tags = () => parseHashtags(hashtagsInput);

  const finishSuccess = () => {
    const msg = "Your post was published.";
    showToast(msg);
    if (Platform.OS === "ios") {
      Alert.alert("Posted", msg);
    }
    reset();
    onCreated?.();
    onClose();
  };

  const submitTextPost = async () => {
    const h = heading.trim();
    const s = subject.trim();
    const t = tags();
    if (!h && !s && t.length === 0) {
      notifyError("Add a heading, some text, or at least one hashtag.");
      return;
    }
    setPosting(true);
    setNotice(null);
    try {
      await tvAPI.createPost({
        type: "text",
        heading: h || undefined,
        subject: s || undefined,
        hashtags: t.length ? t : undefined
      });
      finishSuccess();
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not create post."));
    } finally {
      setPosting(false);
    }
  };

  const uploadThenCreate = async (label: string, run: () => Promise<void>) => {
    if (posting) return;
    setPosting(true);
    setBusyLabel(label);
    setNotice(null);
    setMediaMenu(null);
    try {
      await run();
      finishSuccess();
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not create post."));
    } finally {
      setPosting(false);
      setBusyLabel(null);
    }
  };

  const publishVideoAsset = async (asset: ImagePicker.ImagePickerAsset, qwertz: boolean) => {
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
        hashtags: tags().length ? tags() : undefined,
        heading: heading.trim() || undefined,
        genre: qwertz ? "qwertz" : undefined,
        sensitive: anySensitive
      });
    });
  };

  const publishImageAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const files = assets.map((a, i) => imageAssetToUploadFile(a, defaultImageUploadName(a, i)));

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
        hashtags: tags().length ? tags() : undefined,
        heading: heading.trim() || undefined,
        sensitive: anySensitive
      });
    });
  };

  const pickVideoFromLibrary = async (qwertz: boolean) => {
    if (!(await ensureMediaLibraryAccess())) {
      notifyError("Allow photo library access in Settings to attach videos.");
      return;
    }
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        quality: 1,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High
      });
      if (picked.canceled || !picked.assets?.length) return;
      await publishVideoAsset(picked.assets[0], qwertz);
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not open your video library."));
    }
  };

  const pickVideoFromCamera = async (qwertz: boolean) => {
    if (!(await ensureCameraAccess())) {
      notifyError("Allow camera access in Settings to record a video.");
      return;
    }
    try {
      const picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        quality: 1,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.High
      });
      if (picked.canceled || !picked.assets?.length) return;
      await publishVideoAsset(picked.assets[0], qwertz);
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not open the camera."));
    }
  };

  const pickImagesFromLibrary = async () => {
    if (!(await ensureMediaLibraryAccess())) {
      notifyError("Allow photo library access in Settings to attach images.");
      return;
    }
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.92
      });
      if (picked.canceled || !picked.assets?.length) return;
      await publishImageAssets(picked.assets);
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not open your photo library."));
    }
  };

  const pickImagesFromCamera = async () => {
    if (!(await ensureCameraAccess())) {
      notifyError("Allow camera access in Settings to take a photo.");
      return;
    }
    try {
      const picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.92
      });
      if (picked.canceled || !picked.assets?.length) return;
      await publishImageAssets(picked.assets);
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not open the camera."));
    }
  };

  const onPickAudio = async () => {
    try {
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
        notifyError("Could not read the selected audio file.");
        return;
      }
      const name = asset?.name || fileNameFromUri(uri, "audio.m4a");
      const type = asset?.mimeType || "audio/mpeg";
      const webFile = (asset as any)?.file;

      let artworkUrl: string | undefined;
      if (await ensureMediaLibraryAccess()) {
        const art = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
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
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not add audio."));
    }
  };

  const onGoLive = () => {
    void Linking.openURL(LIVE_URL).catch(() => {
      notifyError("Could not open the live page.");
    });
  };

  const menuTitle =
    mediaMenu === "images"
      ? "Add images or GIFs"
      : mediaMenu === "qwertz"
        ? "Create Qwertz video"
        : mediaMenu === "video"
          ? "Add video"
          : "";

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
              {notice ? (
                <View
                  style={[
                    styles.notice,
                    notice.tone === "error" ? styles.noticeError : styles.noticeSuccess
                  ]}
                >
                  <Text
                    style={[
                      styles.noticeText,
                      notice.tone === "error" ? styles.noticeTextError : styles.noticeTextSuccess
                    ]}
                  >
                    {notice.text}
                  </Text>
                </View>
              ) : null}

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
                  <Text style={styles.postBtnText}>Post</Text>
                )}
              </Pressable>

              <Text style={styles.shortcutsLabel}>Add to your post</Text>
              <View style={styles.shortcutsRow}>
                <Shortcut
                  icon="videocam-outline"
                  label="Video"
                  disabled={posting}
                  onPress={() => setMediaMenu("video")}
                />
                <Shortcut
                  icon="star-outline"
                  label="Qwertz"
                  disabled={posting}
                  onPress={() => setMediaMenu("qwertz")}
                />
                <Shortcut
                  icon="images-outline"
                  label="GIFs"
                  disabled={posting}
                  onPress={() => setMediaMenu("images")}
                />
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
                Video, images, and GIFs upload to the server, are scanned for safety, then published. Audio uses the music
                upload endpoint. For live streaming, use Go live (opens the site).
              </Text>
            </ScrollView>

            {mediaMenu ? (
              <View style={styles.menuOverlay} pointerEvents="box-none">
                <Pressable style={styles.menuDim} onPress={() => setMediaMenu(null)} />
                <View style={styles.menuCard}>
                  <Text style={styles.menuTitle}>{menuTitle}</Text>
                  <Pressable
                    style={styles.menuBtn}
                    onPress={() => {
                      const qwertz = mediaMenu === "qwertz";
                      setMediaMenu(null);
                      void (mediaMenu === "images"
                        ? pickImagesFromLibrary()
                        : pickVideoFromLibrary(qwertz));
                    }}
                  >
                    <Ionicons name="images-outline" size={20} color={socialTheme.brandBlueDark} />
                    <Text style={styles.menuBtnText}>
                      {mediaMenu === "images" ? "Photo library" : "Photo & video library"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.menuBtn}
                    onPress={() => {
                      const qwertz = mediaMenu === "qwertz";
                      setMediaMenu(null);
                      void (mediaMenu === "images"
                        ? pickImagesFromCamera()
                        : pickVideoFromCamera(qwertz));
                    }}
                  >
                    <Ionicons
                      name={mediaMenu === "images" ? "camera-outline" : "videocam-outline"}
                      size={20}
                      color={socialTheme.brandBlueDark}
                    />
                    <Text style={styles.menuBtnText}>
                      {mediaMenu === "images" ? "Take photo" : "Record video"}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.menuCancel} onPress={() => setMediaMenu(null)}>
                    <Text style={styles.menuCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
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
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    overflow: "hidden"
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
  notice: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth
  },
  noticeError: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca"
  },
  noticeSuccess: {
    backgroundColor: "#ecfdf5",
    borderColor: "#86efac"
  },
  noticeText: {
    ...appTypography.meta,
    lineHeight: 18
  },
  noticeTextError: {
    color: "#b91c1c"
  },
  noticeTextSuccess: {
    color: "#047857"
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
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end"
  },
  menuDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.35)"
  },
  menuCard: {
    backgroundColor: socialTheme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 28 : 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: socialTheme.borderHairline,
    gap: 8
  },
  menuTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary,
    marginBottom: 4
  },
  menuBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: socialTheme.surfaceMuted
  },
  menuBtnText: {
    ...appTypography.input,
    color: socialTheme.textPrimary,
    flex: 1
  },
  menuCancel: {
    alignItems: "center",
    paddingVertical: 12
  },
  menuCancelText: {
    ...appTypography.cta,
    color: socialTheme.textSecondary
  }
});
