/**
 * Facebook Page → QwertyTV wall ingest (no repost to Qwertymates Facebook Page).
 * Cron times are Africa/Johannesburg (SAST) via scheduler timezone option.
 */

export type FacebookTvBotId = "education" | "business" | "sports";

export type FacebookTvIngestSlot = {
  botId: FacebookTvBotId;
  /** Public Page username/slug from facebook.com/{pageSlug} */
  pageSlug: string;
  /** Display label for captions */
  pageLabel: string;
  /** Standard 5-field cron (minute hour dom month dow); interpreted in FACEBOOK_TV_INGEST_TZ */
  cron: string;
  genre: string;
  hashtags: string[];
};

/** User-provided schedule (May 2026). */
export const FACEBOOK_TV_INGEST_SLOTS: FacebookTvIngestSlot[] = [
  // Bot 1 — Education / news / editorial
  {
    botId: "education",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 8 * * 1",
    genre: "news",
    hashtags: ["Education", "News", "DumaFM", "QwertyTV"],
  },
  {
    botId: "education",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 8 * * 0",
    genre: "news",
    hashtags: ["Editorial", "Cartoon", "Zapiro", "QwertyTV"],
  },
  {
    botId: "education",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 18 * * 0",
    genre: "nature",
    hashtags: ["Wildlife", "Kruger", "Nature", "QwertyTV"],
  },
  {
    botId: "education",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 8 * * 2",
    genre: "news",
    hashtags: ["Okavango", "News", "QwertyTV"],
  },
  // Bot 2 — Business / motoring
  {
    botId: "business",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 8 * * 3",
    genre: "news",
    hashtags: ["Zambia", "Business", "News", "QwertyTV"],
  },
  {
    botId: "business",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 8 * * 4",
    genre: "motoring",
    hashtags: ["AutoTrader", "Motoring", "Cars", "QwertyTV"],
  },
  {
    botId: "business",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 10 * * 5",
    genre: "news",
    hashtags: ["Business", "Africa", "QwertyTV"],
  },
  // Bot 3 — Sports (@worldnews): Tuesday + Friday (SAST)
  {
    botId: "sports",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 8 * * 2",
    genre: "sport",
    hashtags: ["SportsCenter", "Sports", "WorldNews", "QwertyTV"],
  },
  {
    botId: "sports",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 12 * * 2",
    genre: "sport",
    hashtags: ["Football", "BFA", "Sports", "WorldNews", "QwertyTV"],
  },
  {
    botId: "sports",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 18 * * 2",
    genre: "sport",
    hashtags: ["Boxing", "RingMagazine", "Sports", "WorldNews", "QwertyTV"],
  },
  {
    botId: "sports",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 8 * * 5",
    genre: "sport",
    hashtags: ["SportsCenter", "Sports", "WorldNews", "QwertyTV"],
  },
  {
    botId: "sports",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 12 * * 5",
    genre: "sport",
    hashtags: ["Football", "BFA", "Sports", "WorldNews", "QwertyTV"],
  },
  {
    botId: "sports",
    pageSlug: "427972753928205",
    pageLabel: "Qwertymates",
    cron: "0 18 * * 5",
    genre: "sport",
    hashtags: ["Boxing", "RingMagazine", "Sports", "WorldNews", "QwertyTV"],
  },
];

export const FACEBOOK_TV_BOT_LABELS: Record<FacebookTvBotId, string> = {
  education: "Education & news",
  business: "Business & motoring",
  sports: "Sports",
};
