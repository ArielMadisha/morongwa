# Qwertz (Qwertymates Video Editing Suite)

Canonical specification lives in the standalone Qwertz workspace:

`C:\Users\Dell\.cursor\projects\Qwertz\DOCS\Qwertz\`

| Doc | Path (Qwertz repo) |
|-----|-------------------|
| Architecture | `ARCHITECTURE.md` |
| API contract | `API.md` |
| Phases | `PHASES.md` |
| POPIA | `POPIA.md` |

## Qwertymates integration

| Item | Location |
|------|----------|
| Backend proxy | `backend/src/routes/qwertz.ts` → `/api/qwertz/*` |
| Web editor stub | `frontend/app/qwert/page.tsx` |
| Mobile stub | `mobile/src/screens/QwertScreen.tsx` |
| Env | `QWERTZ_API_URL`, `QWERTZ_API_KEY` in `backend/.env` |

## Run locally

```bash
# Terminal 1 — Qwertz service (requires FFmpeg on PATH)
cd C:/Users/Dell/.cursor/projects/Qwertz
npm install && npm run dev

# Terminal 2 — Qwertymates backend
cd morongwa/backend
# set QWERTZ_API_URL=http://localhost:4100
npm run dev
```

Web: https://www.qwertymates.com/qwert (after frontend deploy)
