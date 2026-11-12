# Personal deployment

Both launchers use https://exam-fhya.onrender.com/overlay?window=compact.

## Private device access

Generate two independent random tokens, each at least 32 random bytes encoded as base64url (43 characters). Keep them out of Git, app packages and screenshots.

On Render set PERSONAL_USE_ONLY=true and PERSONAL_DEVICE_TOKENS to the two tokens separated by a comma. Restart the backend. Missing, duplicate or short tokens deny session creation when personal mode is enabled.

Place the Mac token in ~/Library/Application Support/answer-overlay-mac/device-token.txt. Place the Windows token in %APPDATA%/AnswerOverlay/device-token.txt. Create the directories first. Restrict file access to your OS account. The Windows file lives outside the temporary portable runtime.

Each launcher attaches its token only to session creation at the configured HTTPS origin. Subsequent requests use the existing expiring session bearer token. Tokens authorize possession, not hardware identity. Removing a token prevents new sessions for that token. Existing sessions retain their existing expiry.

## Builds

Windows runner uses .NET SDK 10.0.100 and Electron 45.2.3. Run deployment/windows-uia/build.ps1 on Windows with that SDK to reproduce the portable executable. It verifies the downloaded Electron ZIP against the release checksum, builds the current reader, and embeds the runtime and launcher source. The GitHub workflow builds on a matching main-branch push or manual dispatch.

The launcher requires Windows 10/11 x64. Actual interactive refresh, permissions, focus, disconnect and capture protection tests on Windows remain required.

Mac runtime is Electron 45.2.3 arm64, copied from the existing app bundle. Replace Resources/app main.cjs, preload.cjs, read-browser.cjs and package.json from deployment/macos, sign with codesign, and package with ditto. Local ad-hoc signing does not provide notarization or Developer ID trust.

Never label the existing old Windows executable as a fresh release. Download a successful workflow artifact matching the source commit.
