const {app,BrowserWindow,globalShortcut}=require("electron");
const assert=require("node:assert/strict");
const timer=setTimeout(()=>app.exit(1),20000);
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,transparent:true,frame:false,alwaysOnTop:true,
    webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL("about:blank");
  require("../tray.cjs")(win,()=>{});
  for(const key of ["Shift+Enter","Shift+Escape","Shift+Left","Shift+Right","Shift+Up","Shift+Down","Shift+=","Shift+-"])
    assert(globalShortcut.isRegistered(key), "Shortcut unavailable: "+key);
  for(const opacity of [0.9,0.4,1]){
    win.setOpacity(opacity);
    assert(Math.abs(win.getOpacity()-opacity)<0.02,"Native opacity failed");
  }
  assert(win.isAlwaysOnTop());
  win.setContentProtection(true);
  win.setContentProtection(false);
  console.log("PASS: Windows Electron window startup, all 8 key registrations, native opacity, always-on-top and protection API calls.");
  clearTimeout(timer);
  app.quit();
}).catch(error=>{
  console.error(error.message);
  clearTimeout(timer);
  app.exit(1);
});
