export function overlayLauncher(appOrigin: string) {
  const overlayUrl = new URL("/overlay", appOrigin).href
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="refresh" content="0; url=${overlayUrl}">
  <title>Answer Overlay Launcher</title>
  <style>
    body { margin: 0; font: 1rem/1.5 system-ui, sans-serif; background: #f7f8fa; color: #182230; }
    main { max-width: 34rem; margin: 8vh auto; padding: 1.5rem; }
    .open { display: inline-block; padding: .65rem 1rem; border-radius: .5rem; background: #164e63; color: #fff; }
  </style>
</head>
<body>
  <main>
    <a class="open" href="${overlayUrl}">Open desktop overlay</a>
  </main>
</body>
</html>`;
}
