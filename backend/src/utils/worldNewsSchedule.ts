/** @worldnews TV/wall autopost runs Tuesday + Friday (SAST by default). */
export function isWorldNewsAutopostDay(
  date = new Date(),
  timezone = String(process.env.AI_NEWS_TIMEZONE || process.env.FACEBOOK_TV_INGEST_TZ || "Africa/Johannesburg").trim()
): boolean {
  const label = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone })
    .format(date)
    .toLowerCase();
  return label.startsWith("tue") || label.startsWith("fri");
}
