# Production upgrade audit

Inspected 2026-11-12. This report describes repository evidence, not platform certification.

## Existing implementation

- React renderer: apps/answer-overlay/App.tsx. Fastify backend: apps/server/app.ts.
- Mac main/preload/reader: deployment/macos. Mac URL currently uses localhost:39117.
- Windows main/preload: deployment/windows-uia. Uses hosted HTTPS and a native .NET UI Automation reader limited to Edge.
- Browser screenshot capture remains available in the web clients. Native Mac reads selected browser tab text using Apple Events. Native Windows reads selected Edge accessibility controls.
- Ctrl+Alt+Enter requests refresh. Mac Ctrl+H toggles content protection.
- Context isolation and sandboxing enabled. Renderer Node integration disabled. IPC validates sender and origin. Navigation and child windows restricted.
- Backend uses expiring bearer session tokens, approved QR device pairing, rate limiting, generation checks and cancellation. Sessions are held in memory.
- QR pairing authorizes a mobile device to join a desktop session.
- AI credentials and prompts live in the backend. Question text and ordered choices, or a requested screenshot in web capture mode, are sent to that backend and then the configured AI provider.
- Vite builds the renderer. Mac app was assembled locally and ad-hoc signed. Windows portable bootstrap embeds an Electron payload and a .NET reader.

## Release gates

Payments, subscriptions, question credits, remaining-credit UI and paid entitlement enforcement are excluded from the production scope by user direction on 2026-11-12. Session authentication, expiration, request rate limits and authorized device pairing remain part of the scope.

Production Mac URL must be configured for HTTPS. Current local Mac build requires a running local server. Public release requires signing identities and Mac notarization credentials. Ad-hoc signing is not notarization.

Actual Windows 10/11 execution, Intel Mac execution, tray behavior, capture privacy and resource measurements require target systems. Source checks and cross compilation do not certify these behaviors.

## Capture compatibility record

| Scenario | Observed result |
| --- | --- |
| Mac screenshot tools | User reported protection working earlier. No controlled test of this release |
| Windows Snipping Tool | Untested |
| Zoom sharing | Untested |
| Teams sharing | Untested |
| Browser screen sharing | Untested for this release |

Content protection requests platform capture exclusion. It does not establish universal exclusion. OS permission indicators and process monitoring remain active.

## Performance record

Idle CPU, idle memory, active CPU, peak memory, startup duration and average answer latency have not been measured for this release. No estimates are presented as measurements.

## Scope limitations

The text readers support accessible multiple-choice content. Image/canvas questions, inaccessible frames and ambiguous groups can fail.
