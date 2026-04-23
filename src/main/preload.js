const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexusApi", {
  getOverview: () => ipcRenderer.invoke("system:get-overview"),
  getBatteryDetails: () => ipcRenderer.invoke("system:get-battery-details"),
  getOptimizerCatalog: () => ipcRenderer.invoke("optimizer:get-catalog"),
  getOptimizerInsights: () => ipcRenderer.invoke("optimizer:get-insights"),
  applyOptimizerPlan: (payload) => ipcRenderer.invoke("optimizer:apply-plan", payload || {}),
  scanJunk: () => ipcRenderer.invoke("scan:junk"),
  scanEmptyFolders: () => ipcRenderer.invoke("scan:empty-folders"),
  runCleanup: (options) => ipcRenderer.invoke("cleanup:execute", options || {}),
  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath),
});
