# Ask MacGyver (standalone mirror)

This folder holds a **copy of the MacGyver gateway sources** from the Morongwa monorepo so a separate Ask MacGyver deploy / satellite can stay aligned.

## Sync from Morongwa (after backend changes)

From the repo root:

```bash
cd backend
npm run standalone:sync-ask-macgyver
```

Or:

```bash
node backend/scripts/syncStandaloneSatellites.mjs
```

That overwrites files under `standalone/AskMacGyver/src/` and refreshes `standalone/ACBPayWallet/src/services/satelliteSync.ts`. Commit the result in **this** repo (or push to your standalone product repo).

## Canonical paths (Morongwa)

| Mirror | Source |
|--------|--------|
| `src/services/macgyverSearch.ts` | `backend/src/services/macgyverSearch.ts` |
| `src/services/macgyverService.ts` | `backend/src/services/macgyverService.ts` |
| `src/services/macgyverLLM.ts` | `backend/src/services/macgyverLLM.ts` |
| `src/services/macgyverWebSearch.ts` | `backend/src/services/macgyverWebSearch.ts` |
| `src/services/macgyverLearned.ts` | `backend/src/services/macgyverLearned.ts` |
| `src/data/macgyverKnowledge.ts` | `backend/src/data/macgyverKnowledge.ts` |
| `src/data/models/MacGyverLearnedEntry.ts` | `backend/src/data/models/MacGyverLearnedEntry.ts` |

The live HTTP routes in `backend/src/routes/macgyver.ts` (auth middleware):

- `POST /api/macgyver/ask` — `{ query: string }`
- `POST /api/macgyver/ask-image` — multipart `image` (JPEG/PNG/GIF/WebP, max 8 MB) plus optional `hint`

Wire your satellite server to the same handler pattern. Image search uses OpenAI vision to caption the photo, then the same platform + open-web + LLM pipeline as text ask.

## Env (OpenAI + open web + learned cache)

- `OPENAI_API_KEY`
- `MACGYVER_OPENAI_MODEL` (optional, default `gpt-4o-mini`)
- `MACGYVER_OPENAI_TIMEOUT_MS` (optional, default `22000` ms)
- `TAVILY_API_KEY` (optional; richer web snippets than Wikipedia/DDG alone)
- `MACGYVER_WEB_SEARCH_DISABLED=1` (optional; disables outbound web fetch)
- `MACGYVER_LEARNED_MAX_AGE_MS` (optional; Mongo answer cache TTL, default 24h)

## Qwertymates push events

Inbound signed sync: set `ASKMACGYVER_SYNC_URL` on Morongwa backend (`backend/src/services/satelliteSync.ts`).
