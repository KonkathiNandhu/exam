const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edgeReader", {
  sourceLabel: "browser tab",
  select: () => ipcRenderer.invoke("browser:select"),
  read: () => ipcRenderer.invoke("browser:read"),
  disconnect: () => ipcRenderer.invoke("browser:disconnect"),
  onRefreshShortcut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("browser:refresh-shortcut", listener);
    return () => ipcRenderer.removeListener("browser:refresh-shortcut", listener);
  },
});
