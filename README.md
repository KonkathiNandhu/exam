# Authorized Screen-to-Mobile Assistant

Phase 1 implementation for explicitly authorized practice and AI-assisted training. React + TypeScript + Vite, Fastify, WebSockets, native `getDisplayMedia`, on-demand JPEG frames, and an OpenAI-compatible vision/answer provider.

## Run

Install Node.js 22 or newer. From this directory:

```sh
npm ci
cp .env.example .env
# Set AI_API_KEY and the model names supported by your provider in .env.
npm run build
npm start
```

Open http://localhost:3000 on the desktop. `/practice` contains 30 practice questions; `/mobile` is the paired interface. `npm run dev` serves the same app with Vite development middleware. The provider must support image inputs, JSON object output, and Chat Completions. Keys are read only by the server. There is no production mock-answer mode. Vision extraction is the OCR implementation; there is no local OCR fallback.

This workspace is configured for **desktop-only localhost pairing preview** first. After starting capture, choose Create local pairing preview, open the link on this computer, confirm in the mobile-layout tab, and approve the matching code on the desktop. It intentionally generates no phone QR. A backend AI key is required only for real suggestions.

For physical phones, disable LOCAL_PAIRING_PREVIEW and configure LAN trusted HTTPS or the actual cloud deployment origin. See [complete network setup, Windows/macOS steps and troubleshooting](docs/CONNECTIVITY.md). PUBLIC_APP_URL, PUBLIC_API_URL and PUBLIC_WS_URL are validated at runtime; CORS and socket origins are explicitly allowlisted. Missing secure configuration blocks remote pairing instead of falling back to localhost.

## Use

1. Open `/practice` in another tab or window.
2. On the desktop assistant, acknowledge authorization and click **Start Screen Sharing**. Choose only permitted content in the native browser picker.
3. Keep the full question and all choices visible. No frames are extracted or sent automatically. Browser sharing permission stays active so a later Refresh can read exactly one resized frame (at most 1600 pixels wide).
4. Generate a QR code and scan it with the phone (or open the local preview link). Codes expire after two minutes and are single-use. Confirm on the phone, compare the six-digit code, and approve on the desktop. One desktop and one phone are supported per session.
5. Tap the circular green Refresh button to analyze exactly one frame. The old answer clears immediately and Processing appears. Only the selected letter/number and its matching answer text are displayed. Advance the practice question and tap Refresh again; there is no automatic question-change detection or mobile history.
6. Stop Sharing, the browser's own stop control, or Disconnect ends the session and revokes credentials. Session expiration is enforced by the server after 60 minutes.

The phone receives question/answer JSON only. It never receives screen images or video. Browser capture indicators remain visible. Reloading the desktop cannot restore a screen stream: stop/reconnect with a new user gesture. Restarting the server ends all sessions.

Optional `ALLOWED_ASSESSMENT_ORIGINS` is a comma-separated list of exact origins. The supplied client then accepts only cooperating tabs that expose a matching Capture Handle origin; unsupported window/monitor sources fail closed. `/practice` opts in. This client check cannot attest source identity against a modified client; use managed browser restrictions where required.

## Verification

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

See [test report](docs/TESTING.md) for executed checks and outstanding manual acceptance work. Browser tests use an isolated server in `tests/e2e/server.ts` with controlled answers and a simulated media stream; production code never imports it.

## Layout

- `apps/desktop-web`: capture, disclosure, QR pairing, controls
- `apps/mobile-web`: question, suggested answer, history, Refresh/Disconnect
- `apps/mock-assessment`: 30 practice MCQs, numeric label and dark-theme toggles
- `apps/server`: authorized HTTP/WebSocket endpoints and static hosting
- `packages/shared`: validated question contracts and UI state types
- `packages/question-detector`: normalization and SHA-256 question identities
- `packages/ai-engine`: vision extraction and independently validated suggestions
- `packages/session-manager`: expiry, tokens, cancellation, cache and history
- `tests`: unit, integration, browser workflow tests
- `deployment`: container and reverse-proxy example
- `extensions/edge-extension`: deferred Phase 2 acceptance gate

See [security and deployment](docs/SECURITY.md) and [manual Edge acceptance](docs/EDGE-ACCEPTANCE.md).

## Optional Chrome overlay

The separate `/overlay` route adds Document Picture-in-Picture without mobile pairing. Start with the original desktop/mobile flow or use [overlay setup and manual acceptance](docs/OVERLAY.md). Both options use the same existing AI backend; configure its key before live AI testing.
