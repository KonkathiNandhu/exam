const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edgeReader", {
  select: () => ipcRenderer.invoke("edge:select"),
  read: () => ipcRenderer.invoke("edge:read"),
  closePortable: process.argv.includes("--portable-overlay")
    ? () => ipcRenderer.invoke("edge:close-portable")
    : undefined,
  disconnect: () => ipcRenderer.invoke("edge:disconnect"),
  onRefreshShortcut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("browser:refresh-shortcut", listener);
    return () => ipcRenderer.removeListener("browser:refresh-shortcut", listener);
  },
});
