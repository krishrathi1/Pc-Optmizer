const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexusApi", {
  getOverview: () => ipcRenderer.invoke("system:get-overview"),
  scanJunk: () => ipcRenderer.invoke("scan:junk"),
  scanEmptyFolders: () => ipcRenderer.invoke("scan:empty-folders"),
  runCleanup: (options) => ipcRenderer.invoke("cleanup:execute", options || {}),
  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath),
});
