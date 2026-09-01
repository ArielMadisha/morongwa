import AsyncStorage from "@react-native-async-storage/async-storage";

export const POST_THEME_SONG_KEY = "qwertymates.mobile.postThemeSong";

export type PostThemeSong = {
  songId: string;
  title: string;
  artist: string;
};

export async function loadPostThemeSong(): Promise<PostThemeSong | null> {
  try {
    const raw = await AsyncStorage.getItem(POST_THEME_SONG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PostThemeSong>;
    if (!parsed?.songId || !parsed.title) return null;
    return {
      songId: String(parsed.songId),
      title: String(parsed.title),
      artist: String(parsed.artist || "")
    };
  } catch {
    return null;
  }
}

export async function savePostThemeSong(song: PostThemeSong): Promise<void> {
  await AsyncStorage.setItem(POST_THEME_SONG_KEY, JSON.stringify(song));
}

export async function clearPostThemeSong(): Promise<void> {
  await AsyncStorage.removeItem(POST_THEME_SONG_KEY);
}
