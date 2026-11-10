const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edgeReader", {
  select: () => ipcRenderer.invoke("edge:select"),
  read: () => ipcRenderer.invoke("edge:read"),
  closePortable: process.argv.includes("--portable-overlay")
    ? () => ipcRenderer.invoke("edge:close-portable")
    : undefined,
  disconnect: () => ipcRenderer.invoke("edge:disconnect"),
});
