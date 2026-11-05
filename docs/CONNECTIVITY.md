# Mobile pairing and network setup

## Root cause and fix

The existing server used `PUBLIC_ORIGIN || http://localhost:3000` for QR generation. A phone resolves localhost to itself. The frontend also used relative API URLs and derived WebSocket URLs from its current page host, while the server accepted only one exact origin. Pairing granted credentials immediately on scan with no desktop approval.

Runtime `/app-config.js` now supplies validated app/API/WS origins. QR generation uses only a validated remote app origin; missing/ambiguous LAN configuration gives an actionable error rather than an unusable QR. Remote origins require HTTPS/WSS. Browser CORS preflights, mutation requests, CSP connection destinations and WebSocket handshakes honor explicit allowed origins. Credentials remain authenticated per session/role. The phone confirms, requests pairing, and receives a short-lived polling credential. The desktop compares the displayed code and approves or rejects. Mobile session credentials are issued only after approval; actual Connected status requires an authenticated WebSocket snapshot. Tokens and pending approvals expire and cannot be reused.

## Test first on localhost (configured in this workspace)

`.env` currently enables `LOCAL_PAIRING_PREVIEW=true`. Start with Node.js 22+:

```sh
npm ci
npm run build
npm start
```

1. Open http://localhost:3000 and `/practice` in another tab.
2. Grant screen-sharing permission through the normal picker.
3. Click **Create local pairing preview**, then **Open mobile preview on this computer**. This is a second tab on the laptop, not a phone URL. No localhost QR is rendered.
4. Click **Confirm pairing** in that tab. Compare the six-digit code and click **Approve pairing** on the desktop.
5. The mobile-layout tab reports Connected only after socket authentication. Test Refresh and Disconnect.
6. Configure the backend AI key to test real suggestions. Pairing itself needs no AI key. Automated browser tests use isolated simulated media and AI fixtures.

Local preview is loopback-only. Configuration rejects combining it with public URLs, non-loopback binding, cloud mode, direct TLS, or LAN_ENABLED. Disable it before testing a physical phone. Ordinary HTTP private IPs do not provide a secure capture context. No certificate-warning bypass is supported.

## LAN: Windows and macOS

The detected address during this task was **192.168.29.184**, adapter **en1**. This is a candidate, not a verified reachable phone endpoint; DHCP can change it.

1. Use your company's approved trusted local HTTPS certificate. Its Subject Alternative Names must include the selected LAN IP or approved DNS hostname; desktop and phone must trust its issuer through approved procedures. An enterprise-issued certificate is preferred. A local developer CA tool such as mkcert is an option only if your organization authorizes it; installing trust on both devices is a separate explicit administrator action. This app does not generate/install trust or bypass warnings.
2. On Windows, inspect `ipconfig` or PowerShell `Get-NetIPAddress -AddressFamily IPv4`. On macOS, inspect System Settings → Network → active connection → Details → TCP/IP, or run `ifconfig`. Match a candidate shown in desktop Connection diagnostics. Exclude loopback, link-local, public and unrelated VPN/VM interfaces.
3. Configure `.env` using the actual assigned IP and actual certificate paths:

```dotenv
PAIRING_MODE=lan
LOCAL_PAIRING_PREVIEW=false
LAN_ENABLED=true
BIND_HOST=0.0.0.0
LAN_IP=192.168.29.184
PORT=3000
PUBLIC_APP_URL=
PUBLIC_API_URL=
PUBLIC_WS_URL=
TLS_CERT=/absolute/path/to/approved-certificate.pem
TLS_KEY=/absolute/path/to/private-key.pem
ALLOWED_APP_ORIGINS=https://localhost:3000
```

On Windows use certificate paths such as `C:/approved-certs/assistant.pem`. Above IP is this task's observed candidate; substitute the current selected address on another machine. With blank public URLs, the app derives `https://<LAN_IP>:3000`, the same API origin, and corresponding WSS origin. Multiple private adapters require an explicit LAN_IP; a single adapter whose name indicates VPN/virtual use also requires explicit selection. Interface names are heuristics, not evidence of reachability. PUBLIC_APP_URL can instead be an explicitly approved HTTPS DNS origin/proxy endpoint. The backend binds to loopback unless LAN_ENABLED or BIND_HOST explicitly enables exposure. Do not expose the Vite debugger; the supported LAN setup uses Fastify and the built app on one port. `npm run dev` uses Vite middleware inside that same server. `VITE_PORT` applies only if running Vite independently, which is not the recommended phone setup.

4. Restart the server, open the trusted HTTPS desktop origin and inspect **Connection diagnostics**. Test Connection confirms API access from that desktop only. Scan the QR, load the phone page, confirm pairing, compare the code, and approve on desktop.
5. Windows: `Test-NetConnection <selected-IP> -Port 3000` checks a TCP path. macOS: `curl --fail https://<selected-IP>:3000/api/health` checks HTTP with normal certificate validation. On the phone open that HTTPS health URL; an `{ "ok": true }` response proves the phone can reach the API host, not that WebSockets or pairing succeeded. If API is separate, use its origin.
6. If those checks fail, record the exact URL, OS/browser error and step. Binding to 0.0.0.0 does not defeat firewalls, separate VLANs, guest Wi-Fi isolation, NAT or enterprise restrictions. Ask IT for an approved route/port/certificate; this project does not change any firewall policies. Do not use `curl -k`, browser insecure-origin flags or warning bypasses.

A localhost desktop and HTTPS mobile can share a session only when their clients target the **same reachable backend**. Explicitly include both browser origins in ALLOWED_APP_ORIGINS, and provide an HTTPS/WSS backend reachable by each. Use an approved HTTPS proxy listening locally and remotely if necessary. This server has one listener; enabling direct TLS does not also provide an HTTP localhost listener. The simplest supported setup loads the desktop and phone from the same trusted HTTPS origin.

## Cloud / different networks

Use your actual deployment, not a placeholder domain:

```dotenv
PAIRING_MODE=cloud
LOCAL_PAIRING_PREVIEW=false
PUBLIC_APP_URL=<actual HTTPS app origin>
PUBLIC_API_URL=<actual HTTPS API origin, or blank for app origin>
PUBLIC_WS_URL=<actual WSS origin, or blank to derive from API>
ALLOWED_APP_ORIGINS=<exact additional desktop HTTPS origin if needed>
BIND_HOST=0.0.0.0
PORT=3000
LAN_ENABLED=false
TLS_CERT=
TLS_KEY=
```

`<...>` entries above are instructions to substitute real origins, not literal valid configuration. Deploy the built Fastify app behind the existing authenticated HTTPS gateway. TLS may terminate there; configure Upgrade forwarding for `/api/socket`, runtime `/app-config.js`, SPA routes and API paths. Keep the upstream private and use existing employee authentication. Never publish a development server. The default app/API base is same-origin; separate origins are supported through PUBLIC_API_URL/PUBLIC_WS_URL plus exact CORS/WS origins. The API origin uses `/api/*`; WS origin uses `/api/socket`. URL paths, embedded credentials, HTTP/WS remote endpoints and localhost remote origins are rejected. Frontend pages must be served with runtime `/app-config.js`, including when using different app/API hosts; do not deploy static files alone without that route and matching CSP.

A phone on cellular data cannot reach a laptop's private LAN IP without an already approved network path. Cloud mode needs a deployed public endpoint available to both devices. Changing environment variables does not create or deploy one.

## Diagnostics and limitations

The desktop section reports mode, local page origin, selected LAN IP/candidates, generated URL origin, API test result, authenticated WebSocket status, pairing state, secure-context status and expiry. Copy Mobile URL copies the exact temporary invitation (including its secret fragment); share it only with the intended phone. The fragment is removed by the mobile page before token exchange and is never sent in an ordinary page request or referrer.

Browsers intentionally do not reveal whether a generic failed fetch was caused by certificate trust, CORS, DNS or firewall rules. The UI lists likely causes rather than inventing an exact diagnosis. Inspect the browser network error and try the health URL from the affected device. A loaded page and successful API response do not establish WSS reachability; Connected appears only after authentication. WebSocket retries use bounded exponential delays (1, 2, 4, then 8 seconds; six reconnect attempts), alongside existing server heartbeats and disconnect grace periods.

No real phone, trusted LAN certificate, or public deployment was available for verification in this task. Network reachability and native Edge capture remain manual acceptance checks. The existing mobile question/answer/history layout and AI processing pipeline are preserved; only a pre-connection pairing prompt was added.

## Files changed for this fix

- `apps/server/network.ts` (new): interface candidates, origin validation, mode and binding configuration.
- `apps/server/app.ts`: runtime config, explicit CORS/WS/CSP origin policy, health check, reachable invitations and approved pairing endpoints.
- `apps/server/index.ts`, `vite.config.ts`, `package.json`: explicit binding/ports and Windows-compatible development command.
- `apps/client.ts`: shared configured API/WSS URLs, network errors and bounded reconnection.
- `apps/desktop-web/App.tsx`: approval controls, local preview, diagnostics/copy/test actions.
- `apps/mobile-web/App.tsx`: phone confirmation and approval polling; existing answer layout retained.
- `packages/session-manager/index.ts`, `packages/shared/index.ts`: short-lived pending approvals and lifecycle cleanup.
- `index.html`, `public/app-config.js`: runtime configuration loading.
- `.env.example` and local ignored `.env`: documented modes and initial local-only preview setup.
- `tests/unit/network.test.ts`, `tests/unit/client-network.test.ts`, `tests/unit/core.test.ts`, `tests/integration/server.test.ts`, `tests/e2e/server.ts`, `tests/e2e/ui.spec.ts`: configuration and revised pairing coverage.
- `deployment/nginx.conf.example` (updated configuration comment), `README.md`, `docs/CONNECTIVITY.md`, `docs/SECURITY.md`, `docs/TESTING.md`: setup, boundaries and verification notes.
