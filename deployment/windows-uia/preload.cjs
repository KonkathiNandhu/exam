const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("edgeReader", {
  select: () => ipcRenderer.invoke("edge:select"),
  read: () => ipcRenderer.invoke("edge:read"),
  disconnect: () => ipcRenderer.invoke("edge:disconnect"),
});
