import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";

test("Windows bridge restricts origin, requires selection, and cancels late reads", async () => {
  const handlers = new Map<string, Function>();
  let complete!: Function;
  let options: any;
  let argumentsUsed: string[] = [];
  let killed = false;
  let contents: any;
  const frame = { url: "https://exam-fhya.onrender.com/overlay" };
  class Window {
    webContents = (contents = {
      mainFrame: frame,
      setWindowOpenHandler() {},
      on() {},
      session: {
        webRequest: { onBeforeSendHeaders() {} },
        setPermissionRequestHandler() {},
        setPermissionCheckHandler() {},
      },
    });
    isDestroyed() {
      return false;
    }
    on() {}
    setContentProtection() {}
    loadURL() {}
  }
  const electron = {
    app: {
      requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(),
      on() {},
      once() {},
      quit() {},
    },
    BrowserWindow: Window,
    globalShortcut: { register: () => true, unregister() {} },
    ipcMain: {
      handle: (name: string, handler: Function) => handlers.set(name, handler),
    },
    dialog: {
      showMessageBox: async () => ({ response: 0 }),
      showErrorBox() {
        assert.fail("Unexpected startup error");
      },
    },
    screen: {
      getPrimaryDisplay: () => ({
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      }),
    },
  };
  runInNewContext(readFileSync("deployment/windows-uia/main.cjs", "utf8"), {
    require: (name: string) =>
      name === "electron"
        ? electron
        : name === "node:path"
          ? path
          : name === "node:fs"
            ? { mkdtempSync: () => "/tmp/mock-reader", rm() {} }
            : name === "node:os"
              ? { tmpdir: () => "/tmp" }
              : {
                  execFile: (
                    _: string,
                    args: string[],
                    opts: any,
                    callback: Function,
                  ) => {
                    argumentsUsed = args;
                    options = opts;
                    complete = callback;
                    return {
                      kill() {
                        killed = true;
                      },
                    };
                  },
                },
    process: { platform: "win32", env: { SystemRoot: "C:\\Windows" } },
    __dirname: "C:\\Prototype",
    URL,
    AbortSignal,
  });
  await Promise.resolve();
  const event = { sender: contents, senderFrame: frame };
  await assert.rejects(
    handlers.get("edge:read")!({ ...event, sender: {} }),
    /Untrusted/,
  );
  await assert.rejects(handlers.get("edge:read")!(event), /Select an Edge/);
  const selecting = handlers.get("edge:select")!(event);
  assert.equal(argumentsUsed.join(), "list");
  assert.equal(options.timeout, 20000);
  complete(
    null,
    JSON.stringify([
      { handle: 123, processId: 42, started: "100", title: "Quiz" },
    ]),
    "",
  );
  assert.equal((await selecting).title, "Quiz");
  const reading = handlers.get("edge:read")!(event);
  assert.equal(options.timeout, 6000);
  assert.ok(argumentsUsed.includes("123"));
  handlers.get("edge:disconnect")!(event);
  assert.equal(killed, true);
  complete(
    null,
    JSON.stringify({ text: "Old question", choices: ["One", "Two"] }),
    "",
  );
  await assert.rejects(reading, /Read cancelled/);
});
