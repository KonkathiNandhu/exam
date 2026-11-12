const { app, Tray, Menu, nativeImage } = require("electron");

module.exports = function installTray(win, disconnectNative) {
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
  function show() {
    if (win.isDestroyed()) return;
    win.setIgnoreMouseEvents(false);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  function send(channel) {
    if (!win.isDestroyed()) win.webContents.send(channel);
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show Overlay", click: show },
    { label: "Refresh", click: () => send("browser:refresh-shortcut") },
    { label: "Disconnect", click: () => {
      disconnectNative();
      send("browser:disconnect-menu");
    } },
    { type: "separator" },
    { label: process.platform === "darwin" ? "Quit" : "Exit", click: () => app.quit() },
  ]));
  tray.on("double-click", show);
  // Hide the Dock entry only after a usable status menu exists.
  if (process.platform === "darwin") app.dock.hide();
  else win.setSkipTaskbar(true);
  let quitting = false;
  win.on("close", event => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  app.on("before-quit", () => {
    quitting = true;
    disconnectNative();
    tray.destroy();
  });
  return tray;
};
