import React, { useCallback, useEffect, useState } from "react";
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
import { formatApiError, messengerAPI, musicAPI, tvAPI } from "../lib/api";
import {
  imageAssetToUploadFile,
  fileNameFromUri,
  guessVideoMime,
  defaultImageUploadName
} from "../lib/mediaUpload";
import { ensureCameraAccess, ensureMediaLibraryAccess } from "../lib/mediaPermissions";
import {
  clearPostThemeSong,
  loadPostThemeSong,
  savePostThemeSong,
  type PostThemeSong
} from "../lib/postThemeSong";
import { SITE_ORIGIN } from "../constants/site";
import { appTypography, socialTheme } from "../theme/socialTheme";
import type { MusicSong, User } from "../types";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful post (and on close). */
  onCreated?: () => void;
};

type Notice = { tone: "error" | "success"; text: string };
type MediaMenu = "video" | "qwertz" | "images" | null;
type PendingMediaType = "video" | "image" | "carousel" | "audio";

type PendingMedia = {
  urls: string[];
  type: PendingMediaType;
  sensitive: boolean;
  genre?: string;
  artworkUrl?: string;
};

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

function pendingReadyLabel(pending: PendingMedia): string {
  const n = pending.urls.length;
  if (pending.type === "audio") return "Audio ready — add a caption and tap Post";
  if (pending.type === "video") {
    return pending.genre === "qwertz"
      ? "Qwertz video ready — add a caption and tap Post"
      : "Video ready — add a caption and tap Post";
  }
  if (pending.type === "carousel") return `${n} images ready — add a caption and tap Post`;
  return n === 1 ? "Image ready — add a caption and tap Post" : `${n} images ready — add a caption and tap Post`;
}

export function CreatePostModal({ visible, onClose, onCreated }: Props) {
  const [heading, setHeading] = useState("");
  const [subject, setSubject] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const [taggedPeople, setTaggedPeople] = useState<User[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [tagHits, setTagHits] = useState<User[]>([]);
  const [tagSearching, setTagSearching] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [mediaMenu, setMediaMenu] = useState<MediaMenu>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [themeSong, setThemeSong] = useState<PostThemeSong | null>(null);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);
  const [soundChoices, setSoundChoices] = useState<MusicSong[]>([]);
  const [soundsLoading, setSoundsLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const saved = await loadPostThemeSong();
      if (!cancelled) setThemeSong(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    const q = tagQuery.trim();
    if (!visible || q.length < 2) {
      setTagHits([]);
      return;
    }
    const t = setTimeout(() => {
      setTagSearching(true);
      void messengerAPI
        .searchUsers(q)
        .then((res) => {
          const rows = res.data?.data ?? [];
          const selected = new Set(taggedPeople.map((u) => String(u._id ?? u.id)));
          setTagHits(
            Array.isArray(rows) ? rows.filter((u) => !selected.has(String(u._id ?? u.id))) : []
          );
        })
        .catch(() => setTagHits([]))
        .finally(() => setTagSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [tagQuery, taggedPeople, visible]);

  const reset = useCallback(() => {
    setHeading("");
    setSubject("");
    setHashtagsInput("");
    setTaggedPeople([]);
    setTagQuery("");
    setTagHits([]);
    setPosting(false);
    setBusyLabel(null);
    setNotice(null);
    setMediaMenu(null);
    setPendingMedia(null);
    setSoundPickerOpen(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const clearPendingMedia = () => {
    setPendingMedia(null);
    setNotice(null);
  };

  const notify = (tone: Notice["tone"], text: string) => {
    setNotice({ tone, text });
    showToast(text);
  };

  const notifyError = (text: string) => {
    if (/Invalid token/i.test(text)) {
      Alert.alert("Sign in again", "Your session expired. Please sign in again to post.");
      return;
    }
    notify("error", text);
  };

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
    // Match web: heading optional; need subject or hashtags for a text post.
    if (!s && t.length === 0 && !h) {
      notifyError("Add a heading, some text, or at least one hashtag.");
      return;
    }
    if (!s && t.length === 0) {
      notifyError("Add some text or at least one hashtag.");
      return;
    }
    setPosting(true);
    setNotice(null);
    try {
      await tvAPI.createPost({
        type: "text",
        heading: h || undefined,
        subject: s || undefined,
        hashtags: t.length ? t : undefined,
        taggedUserIds: taggedPeople.map((u) => String(u._id ?? u.id)).filter(Boolean)
      });
      finishSuccess();
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not create post."));
    } finally {
      setPosting(false);
    }
  };

  const submitPendingMediaPost = async () => {
    if (!pendingMedia?.urls.length) return;
    setPosting(true);
    setBusyLabel("Publishing...");
    setNotice(null);
    try {
      const t = tags();
      const caption = buildCaption(subject, t);
      await tvAPI.createPost({
        type: pendingMedia.type,
        mediaUrls: pendingMedia.urls,
        caption,
        hashtags: t.length ? t : undefined,
        taggedUserIds: taggedPeople.map((u) => String(u._id ?? u.id)).filter(Boolean),
        heading: heading.trim() || undefined,
        genre: pendingMedia.genre,
        sensitive: pendingMedia.sensitive,
        artworkUrl: pendingMedia.artworkUrl,
        songId:
          pendingMedia.type === "video" || pendingMedia.type === "image" || pendingMedia.type === "carousel"
            ? themeSong?.songId
            : undefined
      });
      if (themeSong?.songId) {
        await clearPostThemeSong();
        setThemeSong(null);
      }
      finishSuccess();
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not create post."));
    } finally {
      setPosting(false);
      setBusyLabel(null);
    }
  };

  const onPressPost = () => {
    if (posting) return;
    if (pendingMedia?.urls.length) {
      void submitPendingMediaPost();
      return;
    }
    void submitTextPost();
  };

  const runUploadOnly = async (label: string, run: () => Promise<PendingMedia>) => {
    if (posting) return;
    // Match web: heading is optional for media posts — upload first, then Post.
    setPosting(true);
    setBusyLabel(label);
    setNotice(null);
    setMediaMenu(null);
    try {
      const pending = await run();
      setPendingMedia(pending);
      notify("success", pendingReadyLabel(pending));
    } catch (err: unknown) {
      notifyError(formatApiError(err, "Could not upload media."));
    } finally {
      setPosting(false);
      setBusyLabel(null);
    }
  };

  const uploadVideoAsset = async (asset: ImagePicker.ImagePickerAsset, qwertz: boolean) => {
    const name = asset.fileName || fileNameFromUri(asset.uri, "upload.mp4");
    const type = asset.mimeType || guessVideoMime(name);
    const file = { uri: asset.uri, name, type, webFile: (asset as any).file };

    await runUploadOnly(qwertz ? "Uploading Qwertz..." : "Uploading video...", async () => {
      const up = await tvAPI.uploadMedia(file);
      const url = up.data?.url;
      if (!url) throw new Error("Upload returned no URL.");
      return {
        urls: [url],
        type: "video" as const,
        sensitive: !!up.data?.sensitive,
        genre: qwertz ? "qwertz" : undefined
      };
    });
  };

  const uploadImageAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const files = assets.map((a, i) => imageAssetToUploadFile(a, defaultImageUploadName(a, i)));

    await runUploadOnly("Uploading images...", async () => {
      const up = await tvAPI.uploadImages(files);
      const urls = up.data?.urls || [];
      if (!urls.length) throw new Error("Upload returned no URLs.");
      return {
        urls,
        type: (urls.length > 1 ? "carousel" : "image") as PendingMediaType,
        sensitive: !!up.data?.sensitive
      };
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
      await uploadVideoAsset(picked.assets[0], qwertz);
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
      await uploadVideoAsset(picked.assets[0], qwertz);
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
      await uploadImageAssets(picked.assets);
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
      await uploadImageAssets(picked.assets);
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

      await runUploadOnly("Uploading audio...", async () => {
        const payload = { uri, name, type, webFile };
        const up = await musicAPI.uploadAudio(payload);
        const audioUrl = up.data?.data?.url;
        if (!audioUrl) throw new Error("Audio upload failed.");
        return {
          urls: [audioUrl],
          type: "audio" as const,
          sensitive: false,
          artworkUrl
        };
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

  const openSoundPicker = async () => {
    setSoundPickerOpen(true);
    setSoundsLoading(true);
    try {
      const res = await musicAPI.listSounds({ limit: 40 });
      setSoundChoices(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      setSoundChoices([]);
      notifyError("Could not load sounds.");
    } finally {
      setSoundsLoading(false);
    }
  };

  const pickThemeSong = async (song: MusicSong) => {
    const next = { songId: song._id, title: song.title, artist: song.artist };
    setThemeSong(next);
    await savePostThemeSong(next);
    setSoundPickerOpen(false);
    notify("success", `"${song.title}" set as theme`);
  };

  const clearTheme = async () => {
    setThemeSong(null);
    await clearPostThemeSong();
  };

  const menuTitle =
    mediaMenu === "images"
      ? "Add images or GIFs"
      : mediaMenu === "qwertz"
        ? "Create Qwertz video"
        : mediaMenu === "video"
          ? "Add video"
          : "";

  const hasPending = !!pendingMedia?.urls.length;

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

              <View style={styles.themeCard}>
                <View style={styles.themeCardTop}>
                  <Ionicons name="musical-notes" size={18} color={socialTheme.brandBlueDark} />
                  <Text style={styles.themeCardTitle}>Post theme</Text>
                </View>
                {themeSong ? (
                  <Text style={styles.themeCardBody} numberOfLines={2}>
                    {themeSong.title}
                    {themeSong.artist ? ` — ${themeSong.artist}` : ""}
                  </Text>
                ) : (
                  <Text style={styles.themeCardBodyMuted}>
                    Pick a track from QwertyMusic or the sound library to attach as a theme (videos & photos).
                  </Text>
                )}
                <View style={styles.themeCardActions}>
                  <Pressable
                    onPress={() => void openSoundPicker()}
                    style={styles.themeActionBtn}
                    disabled={posting}
                    accessibilityRole="button"
                    accessibilityLabel="Choose theme sound"
                  >
                    <Text style={styles.themeActionText}>{themeSong ? "Change" : "Choose sound"}</Text>
                  </Pressable>
                  {themeSong ? (
                    <Pressable
                      onPress={() => void clearTheme()}
                      style={styles.themeClearBtn}
                      disabled={posting}
                      accessibilityRole="button"
                      accessibilityLabel="Clear theme"
                    >
                      <Text style={styles.themeClearText}>Clear</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {hasPending && pendingMedia ? (
                <View style={styles.pendingCard}>
                  <View style={styles.pendingTop}>
                    <Ionicons
                      name={
                        pendingMedia.type === "audio"
                          ? "musical-notes-outline"
                          : pendingMedia.type === "video"
                            ? "videocam-outline"
                            : "images-outline"
                      }
                      size={22}
                      color={socialTheme.brandBlueDark}
                    />
                    <View style={styles.pendingCopy}>
                      <Text style={styles.pendingTitle}>Media ready</Text>
                      <Text style={styles.pendingMeta}>
                        {pendingMedia.urls.length} file{pendingMedia.urls.length === 1 ? "" : "s"} ·{" "}
                        {pendingMedia.type}
                        {pendingMedia.genre === "qwertz" ? " · qwertz" : ""}
                        {pendingMedia.artworkUrl ? " · artwork" : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.pendingActions}>
                    <Pressable
                      onPress={clearPendingMedia}
                      disabled={posting}
                      style={styles.pendingActionBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Remove attachment"
                    >
                      <Ionicons name="arrow-back" size={18} color={socialTheme.textSecondary} />
                      <Text style={styles.pendingActionText}>Back</Text>
                    </Pressable>
                    <Pressable
                      onPress={clearPendingMedia}
                      disabled={posting}
                      style={styles.pendingActionBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Remove attachment"
                    >
                      <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                      <Text style={[styles.pendingActionText, styles.pendingRemoveText]}>Remove attachment</Text>
                    </Pressable>
                  </View>
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
                  <TextInput
                    value={tagQuery}
                    onChangeText={setTagQuery}
                    placeholder="Tag people (@name or school)"
                    placeholderTextColor={socialTheme.textMuted}
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  {taggedPeople.length ? (
                    <View style={styles.tagChips}>
                      {taggedPeople.map((u) => {
                        const id = String(u._id ?? u.id);
                        return (
                          <Pressable
                            key={id}
                            onPress={() => setTaggedPeople((prev) => prev.filter((p) => String(p._id ?? p.id) !== id))}
                            style={styles.tagChip}
                          >
                            <Text style={styles.tagChipText}>{u.name || u.username || "User"}</Text>
                            <Ionicons name="close" size={12} color={socialTheme.brandBlueDark} />
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  {tagSearching ? <Text style={styles.tagHint}>Searching…</Text> : null}
                  {tagHits.map((u) => {
                    const id = String(u._id ?? u.id);
                    return (
                      <Pressable
                        key={id}
                        onPress={() => {
                          setTaggedPeople((prev) => [...prev, u]);
                          setTagQuery("");
                          setTagHits([]);
                        }}
                        style={styles.tagHit}
                      >
                        <Text style={styles.tagHitName}>{u.name || u.username || "User"}</Text>
                        {u.username ? <Text style={styles.tagHitHandle}>@{u.username}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable
                onPress={onPressPost}
                disabled={posting}
                style={[styles.postBtn, posting && styles.postBtnDisabled]}
              >
                {posting && (!busyLabel || busyLabel === "Publishing...") ? (
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
                Media is uploaded first and scanned for safety. Add a caption if you like, then tap Post to publish
                (same as web). Heading is optional. For live streaming, use Go live (opens the site).
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

            {soundPickerOpen ? (
              <View style={styles.menuOverlay} pointerEvents="box-none">
                <Pressable style={styles.menuDim} onPress={() => setSoundPickerOpen(false)} />
                <View style={[styles.menuCard, styles.soundPickerCard]}>
                  <Text style={styles.menuTitle}>Choose theme sound</Text>
                  {soundsLoading ? (
                    <ActivityIndicator color={socialTheme.brandBlue} style={{ marginVertical: 16 }} />
                  ) : soundChoices.length === 0 ? (
                    <Text style={styles.themeCardBodyMuted}>No sounds available right now.</Text>
                  ) : (
                    <ScrollView style={styles.soundList} keyboardShouldPersistTaps="handled">
                      {soundChoices.map((s) => (
                        <Pressable
                          key={s._id}
                          style={[
                            styles.soundRow,
                            themeSong?.songId === s._id && styles.soundRowActive
                          ]}
                          onPress={() => void pickThemeSong(s)}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.soundTitle} numberOfLines={1}>
                              {s.title}
                            </Text>
                            <Text style={styles.soundArtist} numberOfLines={1}>
                              {s.artist}
                            </Text>
                          </View>
                          {themeSong?.songId === s._id ? (
                            <Ionicons name="checkmark-circle" size={20} color={socialTheme.brandBlue} />
                          ) : null}
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                  <Pressable style={styles.menuCancel} onPress={() => setSoundPickerOpen(false)}>
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
  themeCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.brandBlueSoft,
    padding: 12,
    gap: 8
  },
  themeCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  themeCardTitle: {
    ...appTypography.labelSm,
    color: socialTheme.brandBlueDark,
    fontWeight: "700"
  },
  themeCardBody: {
    ...appTypography.meta,
    color: socialTheme.textPrimary
  },
  themeCardBodyMuted: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  themeCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  themeActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: socialTheme.brandBlue
  },
  themeActionText: {
    ...appTypography.labelSm,
    color: "#ffffff",
    fontWeight: "600"
  },
  themeClearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  themeClearText: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary
  },
  soundPickerCard: {
    maxHeight: "70%"
  },
  soundList: {
    maxHeight: 280,
    marginVertical: 8
  },
  soundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10
  },
  soundRowActive: {
    backgroundColor: socialTheme.brandBlueSoft
  },
  soundTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  soundArtist: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  pendingCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surfaceMuted,
    padding: 12,
    gap: 10
  },
  pendingTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  pendingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  pendingTitle: {
    ...appTypography.titleSm,
    color: socialTheme.textPrimary
  },
  pendingMeta: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  pendingActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  pendingActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4
  },
  pendingActionText: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  pendingRemoveText: {
    color: "#b91c1c"
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
  tagChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e0f2fe",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  tagChipText: {
    ...appTypography.meta,
    color: socialTheme.brandBlueDark,
    fontWeight: "600"
  },
  tagHint: {
    ...appTypography.meta,
    color: socialTheme.textMuted
  },
  tagHit: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: socialTheme.borderHairline
  },
  tagHitName: {
    ...appTypography.input,
    color: socialTheme.textPrimary
  },
  tagHitHandle: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
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
