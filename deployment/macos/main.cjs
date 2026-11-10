const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  screen,
  session,
  ipcMain,
} = require("electron");
const path = require("node:path");
const {
  browsers,
  listTabs,
  createSource,
  readTab,
  runInTab,
} = require("./read-browser.cjs");

const overlay = new URL("http://localhost:39117/overlay?window=compact");
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
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setContentProtection(true);

  const contents = window.webContents;
  overlaySession.setPermissionCheckHandler(() => false);
  overlaySession.setPermissionRequestHandler((_, __, callback) =>
    callback(false),
  );
  let source;
  let selecting = false;
  let generation = 0;
  function verify(event) {
    if (
      event.sender !== contents ||
      event.senderFrame !== contents.mainFrame ||
      new URL(event.senderFrame.url).origin !== overlay.origin
    )
      throw Error("Untrusted request.");
  }
  function disconnect() {
    generation++;
    const previous = source;
    source = undefined;
    if (previous) void runInTab(previous, "clear").catch(() => {});
  }
  async function choose(message, labels) {
    const { response } = await dialog.showMessageBox(window, {
      message,
      buttons: [...labels, "Cancel"],
      defaultId: labels.length,
      cancelId: labels.length,
    });
    if (response >= labels.length) throw Error("Selection cancelled.");
    return response;
  }
  ipcMain.handle("browser:select", async (event) => {
    verify(event);
    if (selecting) throw Error("The tab picker is already open.");
    selecting = true;
    disconnect();
    const epoch = generation;
    let candidate;
    try {
      const browser =
        browsers[
          await choose(
            "Choose your browser",
            browsers.map((item) => item.name),
          )
        ];
      const tabs = await listTabs(browser);
      if (epoch !== generation) throw Error("Selection cancelled.");
      if (!tabs.length)
        throw Error(`Open a practice tab in ${browser.name} and try again.`);
      const tab =
        tabs[
          await choose(
            "Choose the practice tab to read",
            tabs.map(
              (item) =>
                `${String(item.title || item.origin).slice(0, 90)} · ${item.origin}`,
            ),
          )
        ];
      if (epoch !== generation) throw Error("Selection cancelled.");
      candidate = createSource(browser, tab);
      await readTab(candidate, "select");
      if (epoch !== generation) throw Error("Selection cancelled.");
      source = candidate;
      return { title: tab.title || browser.name };
    } finally {
      if (candidate && source !== candidate)
        void runInTab(candidate, "clear").catch(() => {});
      selecting = false;
    }
  });
  ipcMain.handle("browser:read", async (event) => {
    verify(event);
    if (!source) throw Error("Select a browser tab first.");
    const epoch = generation;
    const input = await readTab(source);
    if (epoch !== generation) throw Error("Read cancelled.");
    return input;
  });
  ipcMain.handle("browser:disconnect", (event) => {
    verify(event);
    disconnect();
  });
  window.on("closed", disconnect);

  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-redirect", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    window = undefined;
  });
  const shortcut = "Control+Alt+Enter";
  if (
    !globalShortcut.register(shortcut, () => {
      if (!source || !window || window.isDestroyed()) return;
      if (!window.isVisible() || window.isMinimized()) window.showInactive();
      contents.send("browser:refresh-shortcut");
    })
  ) {
    window.on("page-title-updated", (event) => event.preventDefault());
    window.setTitle("Answer Overlay · Ctrl+Alt+Enter unavailable");
  }
  app.once("will-quit", () => globalShortcut.unregister(shortcut));
  await window.loadURL(overlay.href);
}
