const api = window.nexusApi;

const metricCardsEl = document.getElementById("metricCards");
const adminBadgeEl = document.getElementById("adminBadge");
const scanTimeEl = document.getElementById("scanTime");
const junkMetaEl = document.getElementById("junkMeta");
const emptyMetaEl = document.getElementById("emptyMeta");
const junkBreakdownEl = document.getElementById("junkBreakdown");
const devFindingsEl = document.getElementById("devFindings");
const emptyResultsEl = document.getElementById("emptyResults");

const runJunkScanBtn = document.getElementById("runJunkScan");
const runCleanupBtn = document.getElementById("runCleanup");
const runEmptyScanBtn = document.getElementById("runEmptyScan");

let latestJunkScan = null;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  return `${value}%`;
}

function formatTime(value) {
  if (!value) {
    return "Never";
  }
  const dt = new Date(value);
  return dt.toLocaleString();
}

function setLoading(button, isLoading, loadingText) {
  button.disabled = isLoading;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    return;
  }
  button.textContent = button.dataset.originalText || button.textContent;
}

function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function addListItem(container, main, sub) {
  const template = document.getElementById("listItemTemplate");
  const fragment = template.content.cloneNode(true);
  fragment.querySelector(".list-main").textContent = main;
  fragment.querySelector(".list-sub").textContent = sub;
  container.appendChild(fragment);
}

function renderMetricCards(overview) {
  const memoryUsed = overview.memory?.used || 0;
  const memoryTotal = overview.memory?.total || 0;
  const firstDisk = Array.isArray(overview.disks) && overview.disks.length ? overview.disks[0] : null;
  const diskUsed = firstDisk && Number.isFinite(firstDisk.size) && Number.isFinite(firstDisk.freeSpace)
    ? firstDisk.size - firstDisk.freeSpace
    : null;

  const cards = [
    {
      title: "CPU Load",
      value: formatPercent(overview.cpu?.usagePercent),
    },
    {
      title: "RAM Usage",
      value: `${formatBytes(memoryUsed)} / ${formatBytes(memoryTotal)} (${formatPercent(overview.memory?.usedPercent)})`,
    },
    {
      title: "Primary Disk",
      value: firstDisk ? `${firstDisk.deviceId} ${formatBytes(diskUsed)} used` : "N/A",
    },
    {
      title: "Battery",
      value: overview.battery && Number.isFinite(overview.battery.chargeRemaining)
        ? `${overview.battery.chargeRemaining}%`
        : "Desktop/Not Available",
    },
  ];

  clearElement(metricCardsEl);
  for (const card of cards) {
    const wrapper = document.createElement("div");
    wrapper.className = "metric-card";

    const title = document.createElement("p");
    title.className = "metric-title";
    title.textContent = card.title;

    const value = document.createElement("p");
    value.className = "metric-value";
    value.textContent = card.value;

    wrapper.appendChild(title);
    wrapper.appendChild(value);
    metricCardsEl.appendChild(wrapper);
  }

  adminBadgeEl.textContent = overview.host?.admin ? "Administrator Mode" : "Non-Admin Mode";
  scanTimeEl.textContent = `Overview: ${formatTime(overview.scannedAt)}`;
}

function renderJunkScan(scan) {
  latestJunkScan = scan;

  junkMetaEl.textContent = `Total potential reclaim: ${formatBytes(scan.totalBytes)} | Scanned ${formatTime(scan.scannedAt)}`;

  clearElement(junkBreakdownEl);
  addListItem(
    junkBreakdownEl,
    `Temp Files: ${formatBytes(scan.temp.totalBytes)}`,
    `${scan.temp.paths.length} locations analyzed`
  );
  addListItem(
    junkBreakdownEl,
    `Application Caches: ${formatBytes(scan.appCaches.totalBytes)}`,
    `${scan.appCaches.apps.length} apps with cache footprint`
  );
  addListItem(
    junkBreakdownEl,
    `Development Junk: ${formatBytes(scan.devJunk.totalBytes)}`,
    `${scan.devJunk.totalItems} residue targets`
  );

  clearElement(devFindingsEl);
  if (!scan.devJunk.topFindings.length) {
    addListItem(devFindingsEl, "No major development junk found", "Scan completed with no matching patterns.");
    return;
  }

  for (const finding of scan.devJunk.topFindings.slice(0, 20)) {
    const label = finding.type === "dir" ? "Directory" : "File";
    addListItem(devFindingsEl, `${label}: ${finding.path}`, `${formatBytes(finding.byteCount)}`);
  }
}

function renderEmptyFolders(result) {
  emptyMetaEl.textContent = `Found ${result.totalFound} empty folders | Scanned ${result.scannedEntries} directories`;

  clearElement(emptyResultsEl);
  if (!result.emptyFolders.length) {
    addListItem(emptyResultsEl, "No empty folders detected", "Everything looks tight in scanned roots.");
    return;
  }

  for (const folder of result.emptyFolders.slice(0, 30)) {
    addListItem(emptyResultsEl, folder, "Potential cleanup candidate");
  }
}

async function refreshOverview() {
  const overview = await api.getOverview();
  renderMetricCards(overview);
}

async function runJunkScan() {
  setLoading(runJunkScanBtn, true, "Scanning...");
  try {
    const scan = await api.scanJunk();
    renderJunkScan(scan);
    scanTimeEl.textContent = `Last scan: ${formatTime(scan.scannedAt)}`;
  } catch (error) {
    junkMetaEl.textContent = `Scan failed: ${error.message || "Unknown error"}`;
  } finally {
    setLoading(runJunkScanBtn, false, "");
  }
}

async function runCleanup() {
  const proceed = window.confirm(
    "This will clear temp folders and known app caches. Continue with cleanup?"
  );
  if (!proceed) {
    return;
  }

  setLoading(runCleanupBtn, true, "Cleaning...");
  try {
    const cleanup = await api.runCleanup({ includeTemp: true, includeAppCaches: true });
    junkMetaEl.textContent = `Cleanup completed: ${formatBytes(cleanup.totals.deletedBytes)} removed across ${cleanup.totals.deletedEntries} entries.`;
    await runJunkScan();
    await refreshOverview();
  } catch (error) {
    junkMetaEl.textContent = `Cleanup failed: ${error.message || "Unknown error"}`;
  } finally {
    setLoading(runCleanupBtn, false, "");
  }
}

async function runEmptyFolderScan() {
  setLoading(runEmptyScanBtn, true, "Scanning...");
  try {
    const result = await api.scanEmptyFolders();
    renderEmptyFolders(result);
  } catch (error) {
    emptyMetaEl.textContent = `Empty-folder scan failed: ${error.message || "Unknown error"}`;
  } finally {
    setLoading(runEmptyScanBtn, false, "");
  }
}

runJunkScanBtn.addEventListener("click", runJunkScan);
runCleanupBtn.addEventListener("click", runCleanup);
runEmptyScanBtn.addEventListener("click", runEmptyFolderScan);

(async () => {
  try {
    await refreshOverview();
    await runJunkScan();
  } catch (error) {
    scanTimeEl.textContent = `Initialization failed: ${error.message || "Unknown error"}`;
  }
})();
