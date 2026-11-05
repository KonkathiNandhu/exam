# Optional Chrome Answer Overlay

This is a separate browser-only prototype at `/overlay`. The original desktop/mobile route, QR pairing, provider, question detector, session manager and APIs remain available. No extension or native executable is installed. The only change to the original desktop page is a link opening this option in a separate tab.

## Run locally

Use the existing Node.js 22+ setup and `.env`:

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3000/overlay in desktop Google Chrome. Localhost is a trustworthy local context; deployments require approved HTTPS. The existing backend `AI_API_KEY` must be configured for real extraction and suggestions. The current workspace key was empty when checked, so live AI remains unavailable until a valid key is added locally and the server restarted. Do not put keys in frontend code or URLs.

1. In Edge, open the authorized mock assessment at `/practice` and keep the complete Java question and choices visible.
2. In Chrome `/overlay`, acknowledge authorized capture and AI assistance. Click **Answer Overlay**. It requests a 260 × 320 CSS-pixel Document Picture-in-Picture window; Chrome may adjust that size.
3. Click **Start Authorized Capture** on the main Chrome page. Select the approved Edge window or screen in Chrome's native picker. This is a separate user gesture because both browser APIs require activation; the app does not attempt to reuse or bypass consumed browser activation. Audio is disabled.
4. Keep the main Chrome page open. Its visible status confirms capture permission is active. Move the floating window through the browser/OS window controls.
5. Tap the green Refresh icon. Exactly one resized JPEG frame is sent through the existing authenticated `/refresh` → WebSocket frame request → `/frame` pipeline. It shows Processing, then only an option letter/number and matching answer. The red Disconnect icon stops tracks, cancels requests, ends the session, clears the answer and closes the floating window.
6. Change the Edge practice question and tap Refresh again. No frames are extracted between taps. Suggestions correspond to the requested frame; the app does not watch subsequent screen changes.

The main page and PiP document share the same React state through a portal. The MediaStream remains owned by the main page and is never serialized. No screenshot/video element is rendered in the overlay. Stylesheets are copied from the existing app with absolute links. Buttons are 64 × 64 pixels, labeled for assistive technologies and have keyboard focus outlines. Text wraps and the layout responds to window size.

Unsupported/insecure browsers report a clear error. There is no ordinary-popup fallback. Capture denial/termination, unreadable content, uncertainty, network/provider failures, expiry and closure have explicit states. Main-page navigation/unmount or overlay closure releases capture. Session revocation uses the existing disconnect and socket-close lifecycle; page exit also attempts a keepalive disconnect. Network partitions cannot guarantee immediate delivery to the server; existing server disconnect grace/expiration still applies.

If ALLOWED_ASSESSMENT_ORIGINS is configured, its existing capture-handle policy still applies: a non-cooperating Edge window/monitor may be rejected. Do not weaken corporate policy to enable this prototype. Nothing suppresses Chrome's sharing indicator, permission dialog or browser-owned PiP controls. Nothing guarantees stacking above protected or exclusive-fullscreen applications.

## Automated verification

`npm test` covers the unchanged backend contracts. `npm run test:e2e` runs both mobile regressions and the new overlay suite. Overlay tests explicitly replace Document PiP with an iframe and native capture with a canvas MediaStream, using the isolated test AI server. They cover unsupported browsers, denial, no idle frames, one request per Refresh, letter/numeric answers, stale-result clearing, 64-pixel controls, unreadable/uncertain/error states, permission revocation, overlay closure, expiry and Disconnect. These are application lifecycle tests, not native PiP/Edge capture or system-wide stacking evidence. Test-only client IPs isolate rate-limit buckets; production limits and proxy trust are unchanged.

## Required real Chrome + Edge acceptance (not performed here)

- Record Chrome/Edge and OS versions, approved provider/model and capture authorization.
- Check actual Document PiP support. Open its native window through the Answer Overlay click, then grant the separate native capture prompt for an authorized Edge source. Confirm the browser sharing indicator and main-page disclosure.
- With the Java fixture visible, Refresh should produce **B — James Gosling**. Advance to HTML, then Refresh; the previous result must clear while Processing appears, then **A — HyperText Markup Language**. Test numeric labels and long wrapping answers.
- Inspect the main page network panel: zero `/frame` calls while idle; one per accepted Refresh. No microphone access, audio track, MediaRecorder, screenshot disk writes or continuous uploads.
- Reject capture, revoke permission, close PiP during analysis, navigate the main page, close Chrome, interrupt networking and let the 60-minute session expire. Confirm tracks release and no old response restores an answer. A new permission request requires another explicit click.
- Test unreadable/incomplete content, uncertainty, provider timeout and missing/invalid key. No fabricated result should appear; full provider diagnostics belong on the main page, not in the minimal floating answer.
- Resize the PiP window and switch focus to Edge. Record actual supported positioning/stacking on Windows. Test protected/fullscreen applications only if authorized; document limitations without bypass attempts.
- Test mobile pairing separately via the original desktop page. Overlay and mobile use independent sessions and should not stop each other's capture.

## Reference

Chrome's Document Picture-in-Picture guide documents feature detection, user gestures, window sizing, styling and lifecycle: https://developer.chrome.com/docs/web-platform/document-picture-in-picture/
