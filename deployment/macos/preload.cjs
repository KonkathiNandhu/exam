const { contextBridge, ipcRenderer } = require("electron");

let keyboardMode = false;
let closeHovered = false;
ipcRenderer.on("browser:keyboard-mode", () => { keyboardMode = true; });
window.addEventListener("mousemove", event => {
  if (!keyboardMode) return;
  const close = document.querySelector(".floating-disconnect");
  const rect = close?.getBoundingClientRect();
  const hovered = !!rect && event.clientX >= rect.left && event.clientX <= rect.right &&
    event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (hovered === closeHovered) return;
  closeHovered = hovered;
  ipcRenderer.send("overlay:close-hover", hovered);
});
window.addEventListener("mouseleave", () => {
  if (!keyboardMode) return;
  closeHovered = false;
  ipcRenderer.send("overlay:close-hover", false);
});

contextBridge.exposeInMainWorld("edgeReader", {
  sourceLabel: "browser tab",
  select: () => ipcRenderer.invoke("browser:select"),
  read: () => ipcRenderer.invoke("browser:read"),
  disconnect: () => ipcRenderer.invoke("browser:disconnect"),
  onDisconnect: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("browser:disconnect-menu", listener);
    return () => ipcRenderer.removeListener("browser:disconnect-menu", listener);
  },
  onRefreshShortcut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("browser:refresh-shortcut", listener);
    return () => ipcRenderer.removeListener("browser:refresh-shortcut", listener);
  },
});
