/** QwertyTV genre chips. Mirrors GET /api/tv/genres so the UI renders before the fetch lands. */
export type TvGenre = { id: string; label: string; desc?: string };

export const TV_GENRE_FALLBACK: TvGenre[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live TV", desc: "Live channels and streaming right now" },
  { id: "comedy", label: "Comedy", desc: "Sitcoms, sketches, dark comedy, mockumentary" },
  { id: "drama", label: "Drama", desc: "Emotional, character-driven storytelling" },
  {
    id: "qwertz",
    label: "Qwertz",
    desc: "Short-form, vertical, full-screen video for entertaining, fast-paced content, often set to music or trending audio"
  },
  { id: "action", label: "Action/Adventure", desc: "Superhero, spy, or high-stakes action" },
  { id: "sport", label: "Sport", desc: "Football, cricket, rugby, athletics, and live sports highlights" },
  { id: "scifi", label: "Science Fiction & Fantasy" },
  { id: "thriller", label: "Thriller & Mystery" },
  { id: "reality", label: "Reality TV" },
  { id: "family", label: "Children & Family" },
  { id: "nature", label: "Nature" },
  { id: "history", label: "History" },
  { id: "podcast", label: "Podcasts" }
];
