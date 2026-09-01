# Qwertymates pitch deck (NquBator)

12-slide investor / accelerator deck. Copy is the owner’s final content; layout uses official Qwertymates brand (Q emblem, sky/blue `#1F6DE0`, navy, white).

## Files

| File | Description |
|------|-------------|
| `Qwertymates-Pitch-Deck.pptx` | Primary 16:9 PowerPoint (13 slides) |
| `Qwertymates-Pitch-Deck.pdf` | PDF companion (same 13 slides) |

## Slides

1. Cover — Q emblem, “Join the Qwerty Revolution”, Ariel Madisha, business@, phone, WhatsApp
2. Problem
3. Vision
4. Product (7 cards: QwertyHub, AskMacGyver, ACBPay Wallet, QwertyTV & QwertyMusic, WhatsApp, Morongwa, Errands)
5. Qwertz — Video Editing Suite (9:16 short video, FFmpeg Phase 1 API)
6. Market & Customer
7. Traction
8. Business Model
9. Competitive Landscape
10. Team
11. Funding Ask
12. NquBator Fit
13. Closing

## Brand

- Official Q mark: `frontend/public/qwertymates-q-mark-official.png`
- Wordmark: `frontend/public/qwertymates-logo.png`
- Palette: `#1F6DE0` / navy `#0B1F3A` / white — not purple

## Regenerate

From `backend/`:

```bash
node scripts/generateNquBatorPitchDeck.mjs
node scripts/sendNquBatorPitchDeckEmail.mjs
```
