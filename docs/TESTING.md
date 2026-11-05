# Verification report

Executed 5 November 2026, macOS arm64, Node.js 22.23.4.

- TypeScript and Vite production build: passed.
- Unit/integration suite: 29 passed, zero failures.
- Playwright Chromium suite: 11 passed, zero failures (simulated capture and controlled AI).
- Mobile answered-state screenshot visually reviewed: green option badge, centered answer, two 96 × 96 circular icon buttons; no question, other options, explanation, history, screenshot or video.

The current mobile workflow is on demand. Browser coverage checks zero frame requests during idle periods before and after analysis; exactly one request per Refresh; immediate clearing and Processing; B — James Gosling, another letter answer and numeric 2 — James Gosling; hidden results on reload; extraction failure without stale results; and Disconnect clearing the answer and ending the authorized media track. Pairing confirmation, desktop approval and authenticated reconnect remain covered.

Backend coverage includes single-use Refresh request IDs, duplicate/unsolicited frame rejection, concurrent Refresh rejection, exact selected-option text mapping, obsolete response cancellation, failure cleanup, expiration, pairing replay/expiry, role authentication, CORS and LAN/cloud URL validation. Mobile snapshots omit internal question/options, explanation and history.

Live provider accuracy, native permission-granted Windows Edge screen capture, real-phone HTTPS connectivity, Docker and public deployment remain unverified. Browser media and AI are explicit test fixtures and establish no real-device capture claim. Session-expiry tests advance the logical deadline rather than waiting an hour. See EDGE-ACCEPTANCE.md for manual checks and CONNECTIVITY.md for network setup.

Provider configuration follow-up: missing API keys now produce explicit setup instructions; provider authentication, permission, model/endpoint and quota errors have safe actionable messages. Build and all 29 unit/integration tests passed. No live AI request was possible without a configured key.

## Optional overlay prototype

The separate `/overlay` route uses the existing authenticated refresh/frame/session APIs and no mobile pairing. Seven additional overlay tests passed alongside all four existing mobile/practice tests. They simulate PiP with an iframe and capture with a canvas stream; test-only proxy/IP settings isolate rate-limit buckets without changing production limits. Verified app behavior includes 260 × 320 requested sizing, 64 × 64 buttons, no idle frames, single-frame Refresh, letters/numbers, unreadable/uncertain/failure states, capture denial/revocation, PiP closure, Disconnect and local session deadline cleanup. The overlay screenshot was visually reviewed. Native Chrome/Edge capture, native PiP positioning/stacking and live AI remain manual checks; see OVERLAY.md.
