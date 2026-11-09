const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const { execFile } = require("node:child_process");
const path = require("node:path");
const overlay = new URL(
  "https://exam-fhya.onrender.com/overlay?window=compact",
);
let win;
let selected;
let pending;
let generation = 0;
let selecting = false;

function runReader(mode, source) {
  return new Promise((resolve, reject) => {
    if (pending) return reject(Error("An Edge read is already running."));
    const reader = path.join(__dirname, "EdgeReader.exe");
    const args = [mode];
    if (source)
      args.push(
        String(source.handle),
        String(source.processId),
        source.started,
      );
    const child = execFile(
      reader,
      args,
      {
        windowsHide: true,
        timeout: mode === "list" ? 20000 : 6000,
        maxBuffer: 200000,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (pending === child) pending = undefined;
        if (error) {
          reject(
            Error(
              error.killed
                ? "Edge did not respond in time. Restore the quiz window and try again."
                : stderr.trim() ||
                    "Windows could not start the accessibility reader. Check your organization's application policy.",
            ),
          );
          return;
        }
        try {
          resolve(JSON.parse(stdout.replace(/^\uFEFF/, "")));
        } catch {
          reject(Error("Windows returned an unreadable accessibility result."));
        }
      },
    );
    pending = child;
  });
}

function disconnect() {
  generation++;
  selected = undefined;
  pending?.kill();
}
function verifySender(event) {
  if (
    !win ||
    win.isDestroyed() ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    new URL(event.senderFrame.url).origin !== overlay.origin
  )
    throw Error("Untrusted request.");
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    win?.restore();
    win?.focus();
  });
  app
    .whenReady()
    .then(() => {
      if (process.platform !== "win32")
        throw Error("This prototype requires Windows and Microsoft Edge.");
      const area = screen.getPrimaryDisplay().workArea;
      win = new BrowserWindow({
        title: "Answer Assistant — Edge prototype",
        width: 360,
        height: 460,
        x: area.x + Math.max(0, area.width - 376),
        y: area.y + Math.max(0, area.height - 476),
        alwaysOnTop: true,
        fullscreenable: false,
        maximizable: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.webContents.on("will-redirect", (event) => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_, __, callback) =>
        callback(false),
      );
      win.webContents.session.setPermissionCheckHandler(() => false);
      win.on("closed", disconnect);
      ipcMain.handle("edge:select", async (event) => {
        verifySender(event);
        if (selecting) throw Error("Window selection is already open.");
        selecting = true;
        disconnect();
        const epoch = generation;
        try {
          const windows = await runReader("list");
          if (epoch !== generation) throw Error("Selection cancelled.");
          if (!Array.isArray(windows) || !windows.length)
            throw Error("Open an Edge window with the authorized quiz first.");
          const { response } = await dialog.showMessageBox(win, {
            message: "Select the Edge window for this session",
            detail:
              "Refresh reads the visible question and choices from the selected window.",
            buttons: [...windows.map((source) => source.title), "Cancel"],
            defaultId: windows.length,
            cancelId: windows.length,
            signal: AbortSignal.timeout(60000),
          });
          if (epoch !== generation || !windows[response])
            throw Error("Selection cancelled.");
          selected = windows[response];
          return { title: selected.title };
        } finally {
          selecting = false;
        }
      });
      ipcMain.handle("edge:read", async (event) => {
        verifySender(event);
        if (!selected) throw Error("Select an Edge window first.");
        const epoch = generation;
        const result = await runReader("read", selected);
        if (epoch !== generation) throw Error("Read cancelled.");
        if (
          typeof result.text !== "string" ||
          result.text.length > 24000 ||
          !Array.isArray(result.choices) ||
          result.choices.length < 2 ||
          result.choices.length > 8 ||
          result.choices.some(
            (choice) =>
              typeof choice !== "string" ||
              !choice.trim() ||
              choice.length > 3000,
          )
        )
          throw Error("Edge returned incomplete question text.");
        return { text: result.text, choices: result.choices };
      });
      ipcMain.handle("edge:disconnect", (event) => {
        verifySender(event);
        disconnect();
      });
      return win.loadURL(overlay.href);
    })
    .catch((error) => {
      dialog.showErrorBox("Answer Assistant could not start", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}
