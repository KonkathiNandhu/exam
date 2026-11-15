const { app, Tray, Menu, nativeImage, globalShortcut, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function installTray(win, disconnectNative) {
  const backgroundOpacity = 0.72;
  let windowOpacity = 0.9;
  win.setOpacity(windowOpacity);
  let themeKey;
  let themeQueue = Promise.resolve();
  function applyTheme() {
    themeQueue = themeQueue.catch(() => {}).then(async () => {
      if (win.isDestroyed() ||
          new URL(win.webContents.getURL()).origin !== "https://exam-fhya.onrender.com") return;
      const themeFile = path.join(__dirname, "overlay.css");
      const base = fs.existsSync(themeFile) ? fs.readFileSync(themeFile, "utf8") : "";
      const css = base + `
        html:has(.floating-answer), body:has(.floating-answer), .overlay-document {
          background: transparent !important;
        }
        .floating-answer {
          background: rgba(0,0,0,${backgroundOpacity}) !important;
          background-image: none !important;
          color: #f3f4f6 !important;
          border: none !important;
        }
        .floating-answer .floating-result {
          background: transparent !important;
          background-image: none !important;
          border: 1px solid #6b7280 !important;
        }
        .floating-answer .floating-result p { color: #d1d5db !important; }
      `;
      const nextKey = await win.webContents.insertCSS(css, { cssOrigin: "user" });
      const previousKey = themeKey;
      themeKey = nextKey;
      if (previousKey) await win.webContents.removeInsertedCSS(previousKey).catch(() => {});
    }).catch(() => {
      tray.setToolTip("Answer Overlay · Background update failed. Reopen the overlay.");
    });
  }
  win.webContents.on("did-finish-load", () => { themeKey = undefined; applyTheme(); });
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      if ((x - 7.5) ** 2 + (y - 7.5) ** 2 > 36) continue;
      const offset = (y * 16 + x) * 4;
      pixels[offset] = 70;
      pixels[offset + 1] = 160;
      pixels[offset + 2] = 70;
      pixels[offset + 3] = 255;
    }
  }
  const icon = nativeImage.createFromBitmap(pixels, { width: 16, height: 16 });
  if (process.platform === "darwin") icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip("Answer Overlay");
  let ready = false;
  win.on("answer-stopped", () => {
    ready = false;
    if (!win.isDestroyed()) win.setIgnoreMouseEvents(false);
  });
  win.on("answer-ready", () => {
    ready = true;
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.send("browser:keyboard-mode");
  });
  function mouseControl(event, closeHovered) {
    if (!ready || typeof closeHovered !== "boolean" ||
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame) return;
    win.setIgnoreMouseEvents(!closeHovered, { forward: true });
  }
  ipcMain.on("overlay:close-hover", mouseControl);
  function show() {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (ready) win.showInactive();
    else { win.show(); win.focus(); }
  }
  function send(channel) {
    if (!win.isDestroyed()) win.webContents.send(channel);
  }
  async function refresh() {
    if (win.isDestroyed()) return;
    show();
    try {
      const refreshed = await win.webContents.executeJavaScript(`(() => {
        if (location.origin !== "https://exam-fhya.onrender.com") return false;
        const button = document.querySelector("button.floating-refresh");
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()`);
      tray.setToolTip(refreshed
        ? "Answer Overlay · Refresh requested"
        : "Answer Overlay · Refresh unavailable: connect a quiz and wait for processing");
    } catch {
      tray.setToolTip("Answer Overlay · Page is loading. Try Refresh again.");
    }
  }
  const registered = [];
  const failed = [];
  function register(key, callback) {
    try {
      if (globalShortcut.register(key, callback)) registered.push(key);
      else failed.push(key);
    } catch {
      failed.push(key);
    }
  }
  register("Shift+Enter", refresh);
  function adjustOpacity(change) {
    windowOpacity = Math.max(0.2, Math.min(1, Math.round((windowOpacity + change) * 100) / 100));
    win.setOpacity(windowOpacity);
    tray.setToolTip("Answer Overlay · Window opacity " + Math.round(win.getOpacity() * 100) + "%");
  }
  register("Shift+=", () => adjustOpacity(0.05));
  register("Shift+-", () => adjustOpacity(-0.05));
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat ||
        !input.shift || input.control || input.meta || input.alt) return;
    if (input.code === "Equal" && !registered.includes("Shift+=")) {
      event.preventDefault();
      adjustOpacity(0.05);
    } else if (input.code === "Minus" && !registered.includes("Shift+-")) {
      event.preventDefault();
      adjustOpacity(-0.05);
    }
  });
  async function disconnect() {
    if (win.isDestroyed()) return;
    ready = false;
    win.setIgnoreMouseEvents(false);
    try {
      await win.webContents.executeJavaScript(`(() => {
        if (location.origin !== "https://exam-fhya.onrender.com") return false;
        const button = document.querySelector("button.floating-disconnect");
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()`);
    } catch {
      tray.setToolTip("Answer Overlay · Capture stopped locally. Page unavailable.");
    } finally {
      disconnectNative();
      if (!win.isDestroyed()) show();
    }
  }
  register("Shift+Escape", disconnect);
  function move(dx, dy) {
    show();
    const bounds = win.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    win.setPosition(
      Math.max(area.x, Math.min(bounds.x + dx, area.x + Math.max(0, area.width - bounds.width))),
      Math.max(area.y, Math.min(bounds.y + dy, area.y + Math.max(0, area.height - bounds.height))),
    );
  }
  register("Shift+Left", () => move(-20, 0));
  register("Shift+Right", () => move(20, 0));
  register("Shift+Up", () => move(0, -20));
  register("Shift+Down", () => move(0, 20));
  const menu = Menu.buildFromTemplate([
    { label: "Show Overlay", click: show },
    { label: "Increase window opacity (Shift + Plus)", click: () => adjustOpacity(0.1) },
    { label: "Decrease window opacity (Shift + Minus)", click: () => adjustOpacity(-0.1) },
    { label: "Refresh (Shift+Enter)", click: refresh },
    { label: "Disconnect (Shift+Esc)", click: disconnect },
    { type: "separator" },
    ...(failed.length ? [{ label: "Unavailable keys: " + failed.join(", "), enabled: false }] : []),
    { label: process.platform === "darwin" ? "Quit" : "Exit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", show);
  // Hide the Dock entry only after a usable status menu exists.
  if (process.platform === "darwin") {
    app.setActivationPolicy("accessory");
    app.dock.hide();
  }
  else win.setSkipTaskbar(true);
  win.setMinimizable(false);
  win.on("minimize", () => {
    win.restore();
    win.showInactive();
  });
  let quitting = false;
  win.on("close", event => {
    if (quitting) return;
    event.preventDefault();
    app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
    registered.forEach(key => globalShortcut.unregister(key));
    ipcMain.removeListener("overlay:close-hover", mouseControl);
    disconnectNative();
    tray.destroy();
  });
  return tray;
};
