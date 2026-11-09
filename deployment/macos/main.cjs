const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  screen,
  session,
  systemPreferences,
} = require("electron");

const overlay = new URL(
  "https://exam-fhya.onrender.com/overlay?window=compact",
);
let window;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app
    .whenReady()
    .then(openOverlay)
    .catch((error) => {
      dialog.showErrorBox("Answer Overlay could not open", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}

async function openOverlay() {
  if (
    process.platform !== "darwin" ||
    parseInt(process.getSystemVersion(), 10) < 15
  ) {
    throw new Error(
      "macOS 15 or later is required for the screen-sharing picker.",
    );
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(360, workArea.width);
  const height = Math.min(420, workArea.height);
  const overlaySession = session.fromPartition("answer-overlay");
  window = new BrowserWindow({
    title: "Answer Overlay",
    width,
    height,
    x: workArea.x + Math.max(0, workArea.width - width - 16),
    y: workArea.y + Math.max(0, workArea.height - height - 16),
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      session: overlaySession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const contents = window.webContents;
  const allowCapture = (sender, permission, url, details) =>
    sender === contents &&
    permission === "display-capture" &&
    details?.isMainFrame !== false &&
    URL.canParse(url) &&
    new URL(url).origin === overlay.origin;

  overlaySession.setPermissionCheckHandler(allowCapture);
  overlaySession.setPermissionRequestHandler(
    (sender, permission, callback, details) => {
      callback(
        allowCapture(sender, permission, details.requestingUrl, details),
      );
    },
  );
  const host = window;
  let choosingSource = false;
  overlaySession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (
      choosingSource ||
      contents.isDestroyed() ||
      request.frame !== contents.mainFrame ||
      !allowCapture(contents, "display-capture", request.securityOrigin) ||
      !request.userGesture ||
      !request.videoRequested ||
      request.audioRequested
    ) {
      callback(null);
      return;
    }

    choosingSource = true;
    let source;
    let failure;
    try {
      source = await chooseWindow(host);
    } catch (error) {
      failure = error;
    } finally {
      choosingSource = false;
    }
    if (contents.isDestroyed() || request.frame !== contents.mainFrame) return;
    callback(source ? { video: source } : null);
    if (failure && !host.isDestroyed()) {
      host.focus();
      await dialog.showMessageBox(host, {
        type: "warning",
        title: "Could not share a window",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  });

  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-redirect", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    window = undefined;
  });
  await window.loadURL(overlay.href);
}

async function chooseWindow(host) {
  const permissionMessage =
    "Allow this copy of Answer Overlay in System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen it.";
  const access = systemPreferences.getMediaAccessStatus("screen");
  if (access === "denied" || access === "restricted")
    throw Error(permissionMessage);
  let timer;
  let sources;
  try {
    sources = await Promise.race([
      desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 0, height: 0 },
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Error(
              "macOS did not return the window list. If you just enabled screen access, quit Answer Overlay and reopen it before trying again.",
            ),
          );
        }, 10000);
      }),
    ]);
  } catch (error) {
    if (systemPreferences.getMediaAccessStatus("screen") !== "granted")
      throw Error(permissionMessage);
    const reason = error instanceof Error ? error.message : String(error);
    throw Error(`Could not load the macOS window list. ${reason}`);
  } finally {
    clearTimeout(timer);
  }
  if (host.isDestroyed()) return;
  if (systemPreferences.getMediaAccessStatus("screen") !== "granted")
    throw Error(permissionMessage);

  const ownWindowId = host.getMediaSourceId().split(":")[1];
  const windows = sources.filter(
    (source) =>
      source.id.startsWith("window:") &&
      source.id.split(":")[1] !== ownWindowId &&
      source.name.trim(),
  );
  if (!windows.length)
    throw Error("Open the browser window with the quiz and try again.");

  const buttons = windows.map(({ name }) => name.replace(/\s+/g, " ").trim());
  const cancelId = buttons.length;
  host.focus();
  const { response } = await dialog.showMessageBox(host, {
    title: "Share a window",
    message: "Choose the browser window with the quiz",
    detail: "Only the selected window will be shared.",
    buttons: [...buttons, "Cancel"],
    defaultId: cancelId,
    cancelId,
    signal: AbortSignal.timeout(60000),
  });
  return windows[response];
}
