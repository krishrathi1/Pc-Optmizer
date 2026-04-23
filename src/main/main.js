const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { constants: fsConstants } = require("fs");
const { execFile } = require("child_process");

const POWER_SHELL = process.env.ComSpec
  ? "powershell.exe"
  : "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

function runPowerShell(command, timeoutMs = 20000) {
  return new Promise((resolve) => {
    execFile(
      POWER_SHELL,
      ["-NoProfile", "-Command", command],
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, error: error.message || String(error), stderr: stderr || "" });
          return;
        }
        resolve({ ok: true, stdout: stdout || "", stderr: stderr || "" });
      }
    );
  });
}

async function exists(dirPath) {
  try {
    await fs.access(dirPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function scanDirectory(rootDir, options = {}) {
  const maxEntries = options.maxEntries ?? 15000;
  const stack = [rootDir];
  let fileCount = 0;
  let dirCount = 0;
  let byteCount = 0;
  let scannedEntries = 0;
  let truncated = false;

  while (stack.length) {
    const current = stack.pop();
    scannedEntries += 1;
    if (scannedEntries > maxEntries) {
      truncated = true;
      break;
    }

    let items;
    try {
      items = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const item of items) {
      const child = path.join(current, item.name);
      if (item.isDirectory()) {
        dirCount += 1;
        stack.push(child);
      } else if (item.isFile()) {
        fileCount += 1;
        try {
          const stat = await fs.stat(child);
          byteCount += stat.size;
        } catch {
          // Ignore inaccessible files.
        }
      }
    }
  }

  return {
    rootDir,
    fileCount,
    dirCount,
    byteCount,
    truncated,
    scannedEntries,
  };
}

function getJunkTargets() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const temp = process.env.TEMP || path.join(local, "Temp");
  const userTemp = path.join(home, "AppData", "Local", "Temp");

  const appCaches = [
    { name: "Slack", dir: path.join(local, "slack", "Cache") },
    { name: "Discord", dir: path.join(local, "Discord", "Cache") },
    { name: "Spotify", dir: path.join(local, "Spotify", "Data") },
    { name: "VS Code", dir: path.join(local, "Code", "Cache") },
    { name: "Photoshop", dir: path.join(local, "Adobe", "UXP", "PluginsStorage") },
  ];

  const devRoots = [
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    path.join(home, "source"),
    path.join(home, "projects"),
    path.join(home, "repos"),
  ];

  return {
    tempDirs: [temp, userTemp],
    appCaches,
    devRoots,
  };
}

async function scanDevJunk() {
  const { devRoots } = getJunkTargets();
  const wantedDirNames = new Set([".terraform", ".gradle", "__pycache__", ".pytest_cache", ".mypy_cache"]);
  const wantedFileNames = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);

  const findings = [];
  let totalBytes = 0;
  let scanned = 0;
  const maxScanEntries = 30000;

  for (const root of devRoots) {
    if (!(await exists(root))) {
      continue;
    }

    const stack = [root];
    while (stack.length && scanned < maxScanEntries) {
      const current = stack.pop();
      scanned += 1;
      let items;
      try {
        items = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const item of items) {
        const child = path.join(current, item.name);
        if (item.isDirectory()) {
          if (wantedDirNames.has(item.name)) {
            const dirScan = await scanDirectory(child, { maxEntries: 4000 });
            totalBytes += dirScan.byteCount;
            findings.push({
              type: "dir",
              path: child,
              byteCount: dirScan.byteCount,
              fileCount: dirScan.fileCount,
              truncated: dirScan.truncated,
            });
            continue;
          }
          if (child.length < 245) {
            stack.push(child);
          }
        } else if (item.isFile() && wantedFileNames.has(item.name)) {
          try {
            const stat = await fs.stat(child);
            totalBytes += stat.size;
            findings.push({ type: "file", path: child, byteCount: stat.size });
          } catch {
            // ignore
          }
        }
      }
    }
  }

  findings.sort((a, b) => b.byteCount - a.byteCount);

  return {
    scannedEntries: scanned,
    truncated: scanned >= maxScanEntries,
    totalBytes,
    totalItems: findings.length,
    topFindings: findings.slice(0, 50),
  };
}

async function scanJunk() {
  const targets = getJunkTargets();

  const tempResults = [];
  for (const dir of targets.tempDirs) {
    if (await exists(dir)) {
      tempResults.push(await scanDirectory(dir, { maxEntries: 8000 }));
    }
  }

  const appResults = [];
  for (const item of targets.appCaches) {
    if (await exists(item.dir)) {
      const result = await scanDirectory(item.dir, { maxEntries: 5000 });
      appResults.push({ ...result, name: item.name });
    }
  }

  const devJunk = await scanDevJunk();

  const tempBytes = tempResults.reduce((acc, x) => acc + x.byteCount, 0);
  const appBytes = appResults.reduce((acc, x) => acc + x.byteCount, 0);

  return {
    scannedAt: new Date().toISOString(),
    temp: {
      totalBytes: tempBytes,
      paths: tempResults,
    },
    appCaches: {
      totalBytes: appBytes,
      apps: appResults,
    },
    devJunk,
    totalBytes: tempBytes + appBytes + devJunk.totalBytes,
  };
}

async function clearDirectoryContents(dir) {
  let deletedBytes = 0;
  let deletedEntries = 0;

  let items;
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { deletedBytes, deletedEntries };
  }

  for (const item of items) {
    const child = path.join(dir, item.name);
    try {
      const stat = await fs.stat(child);
      if (item.isDirectory()) {
        await fs.rm(child, { recursive: true, force: true });
      } else {
        await fs.rm(child, { force: true });
      }
      deletedEntries += 1;
      deletedBytes += stat.size || 0;
    } catch {
      // ignore individual failures
    }
  }

  return { deletedBytes, deletedEntries };
}

async function cleanupSelected(options = {}) {
  const includeTemp = options.includeTemp !== false;
  const includeAppCaches = options.includeAppCaches !== false;

  const targets = getJunkTargets();
  const report = {
    cleanedAt: new Date().toISOString(),
    includeTemp,
    includeAppCaches,
    totals: {
      deletedBytes: 0,
      deletedEntries: 0,
      attemptedPaths: 0,
    },
    details: [],
  };

  if (includeTemp) {
    for (const dir of targets.tempDirs) {
      if (!(await exists(dir))) {
        continue;
      }
      const result = await clearDirectoryContents(dir);
      report.totals.attemptedPaths += 1;
      report.totals.deletedBytes += result.deletedBytes;
      report.totals.deletedEntries += result.deletedEntries;
      report.details.push({ name: "Temp", dir, ...result });
    }
  }

  if (includeAppCaches) {
    for (const item of targets.appCaches) {
      if (!(await exists(item.dir))) {
        continue;
      }
      const result = await clearDirectoryContents(item.dir);
      report.totals.attemptedPaths += 1;
      report.totals.deletedBytes += result.deletedBytes;
      report.totals.deletedEntries += result.deletedEntries;
      report.details.push({ name: item.name, dir: item.dir, ...result });
    }
  }

  return report;
}

async function scanEmptyFolders() {
  const home = os.homedir();
  const roots = [
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    path.join(home, "source"),
    path.join(home, "projects"),
    path.join(home, "repos"),
  ];

  const empty = [];
  let scannedEntries = 0;
  const maxEntries = 40000;

  for (const root of roots) {
    if (!(await exists(root))) {
      continue;
    }

    const stack = [root];
    while (stack.length && scannedEntries < maxEntries) {
      const dir = stack.pop();
      scannedEntries += 1;
      let items;
      try {
        items = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      if (items.length === 0 && dir !== root) {
        empty.push(dir);
      }

      for (const item of items) {
        if (item.isDirectory()) {
          const child = path.join(dir, item.name);
          if (child.length < 245) {
            stack.push(child);
          }
        }
      }
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    scannedEntries,
    truncated: scannedEntries >= maxEntries,
    emptyFolders: empty.slice(0, 500),
    totalFound: empty.length,
  };
}

function toNumber(value) {
  const asNum = Number(value);
  return Number.isFinite(asNum) ? asNum : null;
}

async function getDiskInfo() {
  const cmd = "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID,Size,FreeSpace,VolumeName | ConvertTo-Json -Depth 3";
  const result = await runPowerShell(cmd);
  if (!result.ok || !result.stdout.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row) => ({
      deviceId: row.DeviceID,
      volumeName: row.VolumeName,
      size: toNumber(row.Size),
      freeSpace: toNumber(row.FreeSpace),
    }));
  } catch {
    return [];
  }
}

async function getBatteryInfo() {
  const cmd = "Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus,DesignVoltage,Name | ConvertTo-Json -Depth 3";
  const result = await runPowerShell(cmd, 10000);
  if (!result.ok || !result.stdout.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    return {
      chargeRemaining: toNumber(row.EstimatedChargeRemaining),
      batteryStatus: toNumber(row.BatteryStatus),
      designVoltage: toNumber(row.DesignVoltage),
      name: row.Name || null,
    };
  } catch {
    return null;
  }
}

async function getCpuUsagePercent() {
  const first = os.cpus();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const second = os.cpus();

  if (!first || !second || first.length !== second.length || first.length === 0) {
    return null;
  }

  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < first.length; i += 1) {
    const t1 = first[i].times;
    const t2 = second[i].times;

    const idle1 = t1.idle;
    const idle2 = t2.idle;

    const total1 = t1.user + t1.nice + t1.sys + t1.idle + t1.irq;
    const total2 = t2.user + t2.nice + t2.sys + t2.idle + t2.irq;

    idleDelta += idle2 - idle1;
    totalDelta += total2 - total1;
  }

  if (totalDelta <= 0) {
    return null;
  }

  return Math.round((1 - idleDelta / totalDelta) * 100);
}

async function isAdmin() {
  const cmd = "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)";
  const result = await runPowerShell(cmd, 5000);
  if (!result.ok) {
    return false;
  }
  return result.stdout.trim().toLowerCase() === "true";
}

async function getOverview() {
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const disks = await getDiskInfo();
  const battery = await getBatteryInfo();
  const cpuUsagePercent = await getCpuUsagePercent();
  const admin = await isAdmin();

  return {
    scannedAt: new Date().toISOString(),
    host: {
      computerName: os.hostname(),
      osType: os.type(),
      osRelease: os.release(),
      arch: os.arch(),
      uptimeSeconds: os.uptime(),
      admin,
    },
    cpu: {
      model: (os.cpus()[0] && os.cpus()[0].model) || "Unknown",
      cores: os.cpus().length,
      usagePercent: cpuUsagePercent,
    },
    memory: {
      total: memTotal,
      free: memFree,
      used: memTotal - memFree,
      usedPercent: memTotal > 0 ? Math.round(((memTotal - memFree) / memTotal) * 100) : null,
    },
    disks,
    battery,
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1340,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#041225",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("system:get-overview", async () => getOverview());
  ipcMain.handle("scan:junk", async () => scanJunk());
  ipcMain.handle("scan:empty-folders", async () => scanEmptyFolders());
  ipcMain.handle("cleanup:execute", async (_event, options) => cleanupSelected(options || {}));
  ipcMain.handle("shell:open-path", async (_event, targetPath) => {
    if (typeof targetPath !== "string" || !targetPath.trim()) {
      return { ok: false, error: "Invalid path" };
    }
    const result = await shell.openPath(targetPath);
    return { ok: result === "", error: result || null };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
