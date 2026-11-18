const { contextBridge, ipcRenderer } = require("electron");

let keyboardMode = false;
let closeHovered = false;
ipcRenderer.on("browser:keyboard-mode", () => { keyboardMode = true; });
window.addEventListener("mousemove", event => {
  if (!keyboardMode) return;
  const close = document.querySelector(".floating-disconnect:hover, .floating-quit:hover");
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
  quit: () => ipcRenderer.invoke("overlay:quit"),
  select: () => ipcRenderer.invoke("edge:select"),
  read: () => ipcRenderer.invoke("edge:read"),
  closePortable: process.argv.includes("--portable-overlay")
    ? () => ipcRenderer.invoke("edge:close-portable")
    : undefined,
  disconnect: () => ipcRenderer.invoke("edge:disconnect"),
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
