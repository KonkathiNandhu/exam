# Manual acceptance: Windows Microsoft Edge

Not executed in this environment. Automated Chromium media stubs are not permission-granted Edge capture evidence. Phase 1 acceptance remains open until this checklist is completed using the configured real AI provider and an authorized Windows Edge session.

1. Install dependencies/build; configure HTTPS on a reachable approved host. Verify the provider's vision and answer models support the configured JSON mode.
2. Open `/practice` in Edge. Start sharing from the assistant and grant the native picker permission. Confirm the browser capture indicator and application disclosure are visible. Reject the picker once and verify no session/capture remains active.
3. Pair a real phone using the QR. Tap Refresh. Verify the first Java question internally extracts all four choices and suggests **B — James Gosling**. Inspect the phone network: no image/video payloads should arrive.
4. Advance to HTML and SQL questions, tapping Refresh each time. Verify the previous answer clears immediately, Processing appears, and only the matching selected option and full answer text appear. Confirm exactly one frame request per tap and zero requests while idle.
5. Try numeric options, multiline wrapping, dark theme, zoom sizes, scrolling and partially obscured choices. Ambiguous/incomplete questions must show no answer. Vision recognition quality is a manual acceptance criterion, not established by fixture tests.
6. Revoke permission via Edge's stop control; verify tracks stop, session terminates, and phone reports Disconnected. Stop Sharing and mobile Disconnect must do the same (Disconnect asks for confirmation).
7. Select a different source through the browser's supported controls where available; tap Refresh and verify the old answer clears before the requested new result. The application never silently changes sources.
8. Throttle the provider or use an unavailable model; verify timeout/error state clears the current answer. Move to another question while a request is pending; obsolete completions must not replace the latest result.
9. Disable the phone network briefly, then reconnect within 20 seconds. Verify history resynchronizes; after the grace period both sides terminate. Repeat with desktop connectivity loss and its five-second grace.
10. Refresh the desktop. It must not silently reacquire a stream. A new permission request needs a click. Refresh the phone and verify authenticated reconnection.
11. Wait more than two minutes before redeeming a QR; verify rejection. Try reusing a consumed QR and a random session token; verify rejection.
12. Run a 60-minute session; verify server expiry revokes both credentials, closes sockets and releases capture. Confirm the desktop also stops at the deadline if its network is unavailable.
13. Test with relevant managed Edge policies enabled. If capture is blocked, record the policy limitation and stop. Do not change policy or suppress indicators.

Record browser version, Windows version, provider/model, consent, pass/fail, and any extraction errors without retaining sensitive screenshots.
