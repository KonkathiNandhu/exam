const { contextBridge, ipcRenderer } = require("electron");

let keyboardMode = false;
window.addEventListener("DOMContentLoaded", () => {
  const observer = new MutationObserver(() => {
    const controls = document.querySelector(".floating-controls");
    if (!controls || controls.querySelector(".floating-quit")) return;
    const button = document.createElement("button");
    button.className = "floating-quit";
    button.textContent = "×";
    button.title = "Quit launcher";
    button.setAttribute("aria-label", "Quit launcher");
    button.style.cssText = "color:#e5e7eb;background:#292929;border-color:#6b7280;font-size:30px";
    button.addEventListener("click", () => ipcRenderer.invoke("overlay:quit"));
    controls.appendChild(button);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
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
