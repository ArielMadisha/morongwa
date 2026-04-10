# Zweppe/Mochina WhatsApp Flow Migration Pack

This folder captures the legacy Twilio Studio flow dependencies from the previous `php-app` project and maps them to the current Morongwa backend.

## Why this folder exists

You shared a Twilio Studio JSON flow used by the previous Zweppe/Mochina WhatsApp bot.  
This pack documents all backend endpoints and message codes that flow expects so we can adapt it cleanly to this app.

## Legacy source locations scanned

- `c:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\php-app\api\src\game\views.py`
- `c:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\php-app\api\src\game\runnerview.py`
- `c:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\php-app\api\src\game\manageFundsView.py`
- `c:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\php-app\api\src\game\twilioService.py`
- `c:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\php-app\api\src\constants.py`
- `c:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\php-app\api\register_api.php`

## Files in this pack

- `legacy-flow-endpoints.json`  
  Legacy endpoints used by the Twilio flow, required request fields, and expected `MSGCODE` values.

- `migration-checklist.md`  
  Concrete plan to wire this flow into Morongwa WhatsApp users while reusing existing registration/OTP logic.

## Current app capability snapshot

Already present in Morongwa:

- OTP delivery via Twilio SMS/WhatsApp: `backend/src/services/otpDelivery.ts`
- WhatsApp-first auth registration: `backend/src/routes/auth.ts` (`/send-otp`, `/verify-otp`, `/register`, `/login`)

Missing compared to legacy flow:

- `/game/*`, `/runner/*`, `/funds/*` conversational game endpoints expected by the Studio flow
- Legacy `MSGCODE` response contract expected by `split-based-on` widgets

## Next implementation target

Create a new controller set (recommended namespace: `/api/wa/zweppe/*`) that returns the same `MSGCODE` contract as legacy flow, then swap Twilio Flow HTTP widgets to the new URLs.
