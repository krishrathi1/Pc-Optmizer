const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { constants: fsConstants } = require("fs");
const { execFile } = require("child_process");

const POWER_SHELL = process.env.ComSpec
  ? "powershell.exe"
  : "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

const OPTIMIZATION_CATEGORIES = [
  { id: "safety", title: "Safety & Recovery" },
  { id: "services", title: "Service & Process Optimization" },
  { id: "privacy", title: "Privacy & Telemetry Isolation" },
  { id: "startup", title: "Startup Optimization" },
  { id: "debloat", title: "Debloat & App Pruning" },
  { id: "cleanup", title: "Disk & Cache Cleaning" },
  { id: "registry", title: "Registry & UI Responsiveness" },
  { id: "network", title: "Network Optimization" },
  { id: "features", title: "System Feature Control" },
];

const OPTIMIZATION_ACTIONS = [
  {
    id: "create_restore_point",
    category: "safety",
    title: "Create System Restore Point",
    description: "Creates a restore point before major optimization changes.",
    impact: "high",
    risk: "low",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "Enable-ComputerRestore -Drive 'C:\\' -ErrorAction SilentlyContinue; Checkpoint-Computer -Description 'NexusAI_PreOptimize' -RestorePointType 'MODIFY_SETTINGS'",
    timeoutMs: 60000,
  },
  {
    id: "disable_diagtrack",
    category: "services",
    title: "Disable DiagTrack Telemetry Service",
    description: "Stops and disables the Connected User Experiences and Telemetry service.",
    impact: "high",
    risk: "medium",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "Stop-Service -Name 'DiagTrack' -ErrorAction SilentlyContinue; Set-Service -Name 'DiagTrack' -StartupType Disabled -ErrorAction SilentlyContinue",
  },
  {
    id: "disable_dmwappushservice",
    category: "services",
    title: "Disable Dmwappushservice",
    description: "Stops and disables WAP push telemetry routing service.",
    impact: "high",
    risk: "medium",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "Stop-Service -Name 'dmwappushservice' -ErrorAction SilentlyContinue; Set-Service -Name 'dmwappushservice' -StartupType Disabled -ErrorAction SilentlyContinue",
  },
  {
    id: "set_sysmain_manual",
    category: "services",
    title: "Set SysMain to Manual",
    description: "Reduces aggressive preloading behavior on some systems.",
    impact: "medium",
    risk: "medium",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "Set-Service -Name 'SysMain' -StartupType Manual -ErrorAction SilentlyContinue",
  },
  {
    id: "set_print_spooler_manual",
    category: "services",
    title: "Set Print Spooler to Manual",
    description: "Avoids loading print service at boot when not needed.",
    impact: "low",
    risk: "medium",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "Set-Service -Name 'Spooler' -StartupType Manual -ErrorAction SilentlyContinue",
  },
  {
    id: "set_wsearch_manual",
    category: "services",
    title: "Set Windows Search Service to Manual",
    description: "Reduces indexing overhead on systems where instant search is less important.",
    impact: "medium",
    risk: "medium",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "Set-Service -Name 'WSearch' -StartupType Manual -ErrorAction SilentlyContinue",
  },
  {
    id: "disable_xbox_services",
    category: "services",
    title: "Disable Xbox Services",
    description: "Disables Xbox background services when gaming integration is not needed.",
    impact: "medium",
    risk: "medium",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "Get-Service -Name 'XblAuthManager','XblGameSave','XboxNetApiSvc','XboxGipSvc' -ErrorAction SilentlyContinue | ForEach-Object { Stop-Service -Name $_.Name -ErrorAction SilentlyContinue; Set-Service -Name $_.Name -StartupType Disabled -ErrorAction SilentlyContinue }",
  },
  {
    id: "disable_telemetry_policy",
    category: "privacy",
    title: "Set Telemetry Policy to Minimum",
    description: "Writes policy keys to reduce diagnostic data collection.",
    impact: "high",
    risk: "medium",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' -Name 'AllowTelemetry' -Type DWord -Value 0",
  },
  {
    id: "disable_tailored_experiences",
    category: "privacy",
    title: "Disable Tailored Experiences",
    description: "Turns off personalized suggestions based on diagnostics.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: false,
    kind: "ps",
    command: "New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy' -Name 'TailoredExperiencesWithDiagnosticDataEnabled' -Type DWord -Value 0",
  },
  {
    id: "disable_background_apps",
    category: "privacy",
    title: "Disable Background Apps Global Toggle",
    description: "Prevents Store apps from running in background by default.",
    impact: "high",
    risk: "medium",
    recommended: true,
    requiresAdmin: false,
    kind: "ps",
    command: "New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Name 'GlobalUserDisabled' -Type DWord -Value 1",
  },
  {
    id: "disable_advertising_id",
    category: "privacy",
    title: "Disable Advertising ID",
    description: "Prevents app ad tracking using user advertising ID.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: false,
    kind: "ps",
    command: "New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' -Name 'Enabled' -Type DWord -Value 0",
  },
  {
    id: "disable_activity_history",
    category: "privacy",
    title: "Disable Activity History Collection",
    description: "Turns off activity history publication and upload policies.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name 'EnableActivityFeed' -Type DWord -Value 0; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name 'PublishUserActivities' -Type DWord -Value 0; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System' -Name 'UploadUserActivities' -Type DWord -Value 0",
  },
  {
    id: "disable_location_tracking",
    category: "privacy",
    title: "Disable Location Tracking",
    description: "Disables system location service policy.",
    impact: "low",
    risk: "medium",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors' -Name 'DisableLocation' -Type DWord -Value 1",
  },
  {
    id: "disable_startup_delay",
    category: "startup",
    title: "Remove Startup Delay",
    description: "Disables Explorer startup delay for desktop apps.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: false,
    kind: "ps",
    command: "New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize' -Name 'StartupDelayInMSec' -Type DWord -Value 0",
  },
  {
    id: "debloat_common_uwp",
    category: "debloat",
    title: "Remove Common Consumer UWP Apps",
    description: "Removes common Xbox/consumer app packages for current user.",
    impact: "high",
    risk: "high",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "$apps=@('Microsoft.XboxApp','Microsoft.XboxGamingOverlay','Microsoft.XboxGameCallableUI','Microsoft.XboxSpeechToTextOverlay','Microsoft.ZuneMusic','Microsoft.ZuneVideo','Microsoft.BingNews','Microsoft.GetHelp','Microsoft.Getstarted'); foreach($a in $apps){Get-AppxPackage -Name $a -AllUsers -ErrorAction SilentlyContinue | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue}",
    timeoutMs: 120000,
  },
  {
    id: "cleanup_temp_and_caches",
    category: "cleanup",
    title: "Clean Temp and App Caches",
    description: "Clears temp files and app cache directories used by this app scanner.",
    impact: "high",
    risk: "low",
    recommended: true,
    requiresAdmin: false,
    kind: "internal",
    internal: "cleanup_temp_and_caches",
  },
  {
    id: "remove_empty_folders",
    category: "cleanup",
    title: "Delete Empty Folders",
    description: "Removes empty folders discovered across common project roots.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: false,
    kind: "internal",
    internal: "remove_empty_folders",
  },
  {
    id: "component_store_cleanup",
    category: "cleanup",
    title: "Run Component Store Cleanup (DISM)",
    description: "Runs StartComponentCleanup to reclaim old Windows update components.",
    impact: "medium",
    risk: "medium",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "Dism.exe /online /Cleanup-Image /StartComponentCleanup",
    timeoutMs: 240000,
  },
  {
    id: "clear_delivery_optimization_cache",
    category: "cleanup",
    title: "Clear Delivery Optimization Cache",
    description: "Removes cached update delivery files.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "Delete-DeliveryOptimizationCache -Force -ErrorAction SilentlyContinue",
  },
  {
    id: "empty_recycle_bin",
    category: "cleanup",
    title: "Empty Recycle Bin",
    description: "Clears recycled files across all drives.",
    impact: "low",
    risk: "medium",
    recommended: false,
    requiresAdmin: false,
    kind: "ps",
    command: "Clear-RecycleBin -Force -ErrorAction SilentlyContinue",
  },
  {
    id: "trim_ssd",
    category: "cleanup",
    title: "Run SSD Retrim",
    description: "Issues retrim for SSD volumes to improve long-term write performance.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "Get-Volume | Where-Object { $_.DriveType -eq 'Fixed' -and $_.FileSystemLabel -ne $null } | ForEach-Object { Optimize-Volume -DriveLetter $_.DriveLetter -ReTrim -Verbose -ErrorAction SilentlyContinue }",
    timeoutMs: 120000,
  },
  {
    id: "remove_menu_delay",
    category: "registry",
    title: "Remove Menu Show Delay",
    description: "Sets MenuShowDelay to 0 for snappier menu response.",
    impact: "low",
    risk: "low",
    recommended: true,
    requiresAdmin: false,
    kind: "ps",
    command: "Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -Value '0' -ErrorAction SilentlyContinue",
  },
  {
    id: "set_visual_effects_best_performance",
    category: "registry",
    title: "Set Visual Effects to Best Performance",
    description: "Disables heavy animations and visual effects for responsiveness.",
    impact: "medium",
    risk: "low",
    recommended: false,
    requiresAdmin: false,
    kind: "ps",
    command: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name 'VisualFXSetting' -Type DWord -Value 2 -ErrorAction SilentlyContinue",
  },
  {
    id: "disable_transparency_effects",
    category: "registry",
    title: "Disable Transparency Effects",
    description: "Turns off transparency for lower GPU load and reduced latency.",
    impact: "low",
    risk: "low",
    recommended: true,
    requiresAdmin: false,
    kind: "ps",
    command: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name 'EnableTransparency' -Type DWord -Value 0 -ErrorAction SilentlyContinue",
  },
  {
    id: "disable_game_dvr",
    category: "registry",
    title: "Disable Game DVR / Background Recording",
    description: "Disables background game recording to reduce overhead.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: false,
    kind: "ps",
    command: "New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Name 'AppCaptureEnabled' -Type DWord -Value 0; New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR' -Name 'AllowGameDVR' -Type DWord -Value 0",
  },
  {
    id: "clean_broken_path_entries",
    category: "registry",
    title: "Clean Broken PATH Entries",
    description: "Removes non-existent directories from user and machine PATH variables.",
    impact: "medium",
    risk: "high",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "$scopes=@('User','Machine'); foreach($scope in $scopes){$parts=[Environment]::GetEnvironmentVariable('Path',$scope) -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }; $valid=$parts | Where-Object { ($_ -match '^%') -or (Test-Path $_) } | Select-Object -Unique; [Environment]::SetEnvironmentVariable('Path',($valid -join ';'),$scope)}",
  },
  {
    id: "flush_dns",
    category: "network",
    title: "Flush DNS Cache",
    description: "Clears local DNS resolver cache.",
    impact: "medium",
    risk: "low",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "Clear-DnsClientCache; ipconfig /flushdns | Out-Null",
  },
  {
    id: "set_cloudflare_dns",
    category: "network",
    title: "Set Cloudflare DNS (IPv4)",
    description: "Sets active IPv4 interfaces to 1.1.1.1 and 1.0.0.1.",
    impact: "medium",
    risk: "high",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' } | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ServerAddresses @('1.1.1.1','1.0.0.1') -ErrorAction SilentlyContinue }",
  },
  {
    id: "disable_network_throttling",
    category: "network",
    title: "Disable Network Throttling Index",
    description: "Tweaks multimedia network throttling registry value for latency-sensitive workloads.",
    impact: "medium",
    risk: "medium",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Force | Out-Null; Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name 'NetworkThrottlingIndex' -Type DWord -Value 4294967295",
  },
  {
    id: "disable_nagle_algorithm",
    category: "network",
    title: "Disable Nagle Algorithm (TCPNoDelay)",
    description: "Applies TCP ACK/Nagle latency tweak to active interfaces.",
    impact: "medium",
    risk: "high",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "$ifaces=Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces' -ErrorAction SilentlyContinue; foreach($i in $ifaces){New-ItemProperty -Path $i.PSPath -Name 'TcpAckFrequency' -Value 1 -PropertyType DWord -Force | Out-Null; New-ItemProperty -Path $i.PSPath -Name 'TCPNoDelay' -Value 1 -PropertyType DWord -Force | Out-Null}",
  },
  {
    id: "disable_windows_copilot",
    category: "features",
    title: "Disable Windows Copilot",
    description: "Applies user policy key to disable Copilot surface.",
    impact: "low",
    risk: "low",
    recommended: false,
    requiresAdmin: false,
    kind: "ps",
    command: "New-Item -Path 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot' -Name 'TurnOffWindowsCopilot' -Type DWord -Value 1",
  },
  {
    id: "set_ultimate_performance_power_plan",
    category: "features",
    title: "Enable Ultimate Performance Power Plan",
    description: "Duplicates and activates Ultimate Performance plan (or high performance if unavailable).",
    impact: "high",
    risk: "medium",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 | Out-Null; $plan=(powercfg /list | Select-String -Pattern 'Ultimate Performance|High performance' | Select-Object -First 1).ToString(); if($plan){$guid=($plan -split ':')[1].Split('(')[0].Trim(); powercfg /setactive $guid}",
  },
  {
    id: "disable_hibernation",
    category: "features",
    title: "Disable Hibernation",
    description: "Turns off hibernation and frees hiberfil.sys disk space.",
    impact: "medium",
    risk: "medium",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "powercfg /h off",
  },
  {
    id: "disable_fast_startup",
    category: "features",
    title: "Disable Fast Startup",
    description: "Disables hybrid shutdown for cleaner boot cycles and fewer driver issues.",
    impact: "low",
    risk: "medium",
    recommended: false,
    requiresAdmin: true,
    kind: "ps",
    command: "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power' -Name 'HiberbootEnabled' -Type DWord -Value 0",
  },
  {
    id: "disable_telemetry_scheduled_tasks",
    category: "features",
    title: "Disable Telemetry Scheduled Tasks",
    description: "Disables known CEIP and compatibility telemetry tasks.",
    impact: "medium",
    risk: "medium",
    recommended: true,
    requiresAdmin: true,
    kind: "ps",
    command: "$tasks=@('\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser','\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator','\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip','\\Microsoft\\Windows\\Autochk\\Proxy'); foreach($t in $tasks){$parts=$t.Trim('\\').Split('\\'); $name=$parts[-1]; $path='\\'+(($parts[0..($parts.Length-2)] -join '\\'))+'\\'; Disable-ScheduledTask -TaskName $name -TaskPath $path -ErrorAction SilentlyContinue | Out-Null}",
  },
];

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

async function removeEmptyFolders() {
  const scan = await scanEmptyFolders();
  let deleted = 0;
  let failed = 0;
  for (const dir of scan.emptyFolders) {
    try {
      await fs.rmdir(dir);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    scannedAt: scan.scannedAt,
    totalFound: scan.totalFound,
    deleted,
    failed,
  };
}

function toNumber(value) {
  const asNum = Number(value);
  return Number.isFinite(asNum) ? asNum : null;
}

function parseJsonOutput(raw) {
  if (!raw || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function sanitizeRuntimeMinutes(value) {
  const minutes = toNumber(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  // Some providers return sentinel values (for example 71582788 or 4294967295).
  if (minutes > 60 * 24 * 7) {
    return null;
  }
  return minutes;
}

function stripHtml(text) {
  if (typeof text !== "string") {
    return "";
  }
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMilliWattHourValue(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return null;
  }
  const match = rawText.match(/([\d,]+)\s*mWh/i) || rawText.match(/([\d,]+)/);
  if (!match) {
    return null;
  }
  return toNumber(match[1].replace(/,/g, ""));
}

async function getBatteryReportFallback() {
  const reportPath = path.join(os.tmpdir(), "nexus-battery-report.html");
  const escapedPath = reportPath.replace(/'/g, "''");
  const command = `$p='${escapedPath}'; powercfg /batteryreport /output $p | Out-Null; if (Test-Path $p) { Get-Content -Raw $p }`;
  const result = await runPowerShell(command, 30000);
  if (!result.ok || !result.stdout.trim()) {
    return null;
  }

  const html = result.stdout.replace(/\r?\n/g, " ");
  const extractLabelValue = (label) => {
    const pattern = new RegExp(`<span\\s+class=\"label\">${label}<\\/span><\\/td><td>(.*?)<\\/td>`, "i");
    const match = html.match(pattern);
    return match ? stripHtml(match[1]) : null;
  };

  const name = extractLabelValue("NAME");
  const manufacturer = extractLabelValue("MANUFACTURER");
  const serialNumber = extractLabelValue("SERIAL NUMBER");
  const designCapacityRaw = extractLabelValue("DESIGN CAPACITY");
  const fullChargeCapacityRaw = extractLabelValue("FULL CHARGE CAPACITY");
  const cycleCountRaw = extractLabelValue("CYCLE COUNT");

  return {
    name: name || null,
    manufacturer: manufacturer || null,
    serialNumber: serialNumber || null,
    designCapacitymWh: parseMilliWattHourValue(designCapacityRaw),
    fullChargedCapacitymWh: parseMilliWattHourValue(fullChargeCapacityRaw),
    cycleCount: cycleCountRaw && cycleCountRaw !== "-" ? toNumber(cycleCountRaw.replace(/,/g, "")) : null,
  };
}

async function getDiskInfo() {
  const cmd = "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID,Size,FreeSpace,VolumeName | ConvertTo-Json -Depth 3";
  const result = await runPowerShell(cmd);
  if (!result.ok) {
    return [];
  }

  const rows = parseJsonOutput(result.stdout);
  return rows.map((row) => ({
    deviceId: row.DeviceID,
    volumeName: row.VolumeName,
    size: toNumber(row.Size),
    freeSpace: toNumber(row.FreeSpace),
  }));
}

async function getBatteryInfo() {
  const cmd = "Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus,DesignVoltage,Name | ConvertTo-Json -Depth 3";
  const result = await runPowerShell(cmd, 10000);
  if (!result.ok) {
    return null;
  }

  const rows = parseJsonOutput(result.stdout);
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    chargeRemaining: toNumber(row.EstimatedChargeRemaining),
    batteryStatus: toNumber(row.BatteryStatus),
    designVoltage: toNumber(row.DesignVoltage),
    name: row.Name || null,
  };
}

function mapBatteryStatus(statusCode) {
  const map = {
    1: "Discharging",
    2: "AC connected",
    3: "Fully charged",
    4: "Low",
    5: "Critical",
    6: "Charging",
    7: "Charging (high)",
    8: "Charging (low)",
    9: "Charging (critical)",
    10: "Undefined",
    11: "Partially charged",
  };
  return map[statusCode] || "Unknown";
}

async function getBatteryDetails() {
  const [win32Result, staticResult, fullResult, liveResult, cycleResult, reportFallback] = await Promise.all([
    runPowerShell(
      "Get-CimInstance Win32_Battery | Select-Object Name,DeviceID,BatteryStatus,EstimatedChargeRemaining,EstimatedRunTime,DesignVoltage,Chemistry | ConvertTo-Json -Depth 3",
      10000
    ),
    runPowerShell(
      "Get-CimInstance -Namespace root\\wmi -ClassName BatteryStaticData | Select-Object DeviceName,ManufactureName,SerialNumber,DesignedCapacity | ConvertTo-Json -Depth 3",
      10000
    ),
    runPowerShell(
      "Get-CimInstance -Namespace root\\wmi -ClassName BatteryFullChargedCapacity | Select-Object FullChargedCapacity | ConvertTo-Json -Depth 3",
      10000
    ),
    runPowerShell(
      "Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus | Select-Object RemainingCapacity,ChargeRate,DischargeRate,Voltage,PowerOnline | ConvertTo-Json -Depth 3",
      10000
    ),
    runPowerShell(
      "Get-CimInstance -Namespace root\\wmi -ClassName BatteryCycleCount | Select-Object CycleCount | ConvertTo-Json -Depth 3",
      10000
    ),
    getBatteryReportFallback(),
  ]);

  const win32Rows = parseJsonOutput(win32Result.ok ? win32Result.stdout : "");
  const staticRows = parseJsonOutput(staticResult.ok ? staticResult.stdout : "");
  const fullRows = parseJsonOutput(fullResult.ok ? fullResult.stdout : "");
  const liveRows = parseJsonOutput(liveResult.ok ? liveResult.stdout : "");
  const cycleRows = parseJsonOutput(cycleResult.ok ? cycleResult.stdout : "");

  const win32 = win32Rows[0] || null;
  const staticData = staticRows[0] || null;
  const full = fullRows[0] || null;
  const live = liveRows[0] || null;
  const cycle = cycleRows[0] || null;

  if (!win32 && !staticData && !full && !live && !reportFallback) {
    return {
      available: false,
      message: "No battery telemetry available on this machine.",
      scannedAt: new Date().toISOString(),
    };
  }

  const designCapacity = toNumber(staticData?.DesignedCapacity)
    || toNumber(win32?.DesignCapacity)
    || toNumber(reportFallback?.designCapacitymWh);
  const fullChargedCapacity = toNumber(full?.FullChargedCapacity)
    || toNumber(win32?.FullChargeCapacity)
    || toNumber(reportFallback?.fullChargedCapacitymWh);
  const remainingCapacity = toNumber(live?.RemainingCapacity);
  const chargeRemainingPercent = toNumber(win32?.EstimatedChargeRemaining);
  const runTimeMinutes = sanitizeRuntimeMinutes(win32?.EstimatedRunTime);
  const batteryStatus = toNumber(win32?.BatteryStatus);
  const cycleCount = toNumber(cycle?.CycleCount) || toNumber(reportFallback?.cycleCount);

  const healthPercent = designCapacity && fullChargedCapacity
    ? Math.round((fullChargedCapacity / designCapacity) * 100)
    : null;
  const wearPercent = Number.isFinite(healthPercent) ? Math.max(0, 100 - healthPercent) : null;
  const remainingOfFullPercent = fullChargedCapacity && remainingCapacity
    ? Math.round((remainingCapacity / fullChargedCapacity) * 100)
    : chargeRemainingPercent;

  return {
    available: true,
    scannedAt: new Date().toISOString(),
    identity: {
      name: win32?.Name || staticData?.DeviceName || reportFallback?.name || null,
      deviceId: win32?.DeviceID || null,
      manufacturer: staticData?.ManufactureName || reportFallback?.manufacturer || null,
      serialNumber: staticData?.SerialNumber || reportFallback?.serialNumber || null,
      chemistryCode: toNumber(win32?.Chemistry),
    },
    lifecycle: {
      designCapacitymWh: designCapacity,
      fullChargedCapacitymWh: fullChargedCapacity,
      remainingCapacitymWh: remainingCapacity,
      healthPercent,
      wearPercent,
      remainingOfFullPercent,
      reportedChargePercent: chargeRemainingPercent,
      cycleCount,
    },
    live: {
      batteryStatusCode: batteryStatus,
      batteryStatusLabel: mapBatteryStatus(batteryStatus),
      estimatedRuntimeMinutes: runTimeMinutes,
      chargeRateMilliW: toNumber(live?.ChargeRate),
      dischargeRateMilliW: toNumber(live?.DischargeRate),
      voltageMilliV: toNumber(live?.Voltage) || toNumber(win32?.DesignVoltage),
      powerOnline: typeof live?.PowerOnline === "boolean" ? live.PowerOnline : null,
    },
  };
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

function getOptimizationCatalog() {
  const grouped = OPTIMIZATION_CATEGORIES.map((category) => ({
    ...category,
    actions: OPTIMIZATION_ACTIONS.filter((action) => action.category === category.id),
  }));

  return {
    generatedAt: new Date().toISOString(),
    categories: grouped,
    safeProfileActionIds: OPTIMIZATION_ACTIONS.filter((action) => action.recommended).map((action) => action.id),
  };
}

async function getStartupItems() {
  const cmd = "Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location,User | ConvertTo-Json -Depth 3";
  const result = await runPowerShell(cmd, 12000);
  if (!result.ok) {
    return { totalCount: 0, items: [] };
  }
  const rows = parseJsonOutput(result.stdout);
  return {
    totalCount: rows.length,
    items: rows.slice(0, 40).map((row) => ({
      name: row.Name || "Unknown",
      command: row.Command || "",
      location: row.Location || "",
      user: row.User || "",
    })),
  };
}

async function getServiceStates() {
  const cmd = "Get-Service -Name 'DiagTrack','dmwappushservice','SysMain','Spooler','bthserv','wuauserv','WSearch' -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | ConvertTo-Json -Depth 3";
  const result = await runPowerShell(cmd, 8000);
  if (!result.ok) {
    return [];
  }
  const rows = parseJsonOutput(result.stdout);
  return rows.map((row) => ({
    name: row.Name,
    status: row.Status,
    startType: row.StartType,
  }));
}

async function getCurrentPowerPlan() {
  const result = await runPowerShell("powercfg /getactivescheme", 5000);
  if (!result.ok) {
    return "Unknown";
  }
  return result.stdout.trim() || "Unknown";
}

async function getTelemetryTaskSummary() {
  const command = "$tasks=@('\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser','\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator','\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip','\\Microsoft\\Windows\\Autochk\\Proxy'); $out=@(); foreach($t in $tasks){$parts=$t.Trim('\\').Split('\\'); $name=$parts[-1]; $path='\\'+(($parts[0..($parts.Length-2)] -join '\\'))+'\\'; $task=Get-ScheduledTask -TaskName $name -TaskPath $path -ErrorAction SilentlyContinue; if($task){$out += [PSCustomObject]@{ Name=$t; State=$task.State; Enabled=$task.Settings.Enabled }}} $out | ConvertTo-Json -Depth 3";
  const result = await runPowerShell(command, 8000);
  if (!result.ok) {
    return [];
  }
  return parseJsonOutput(result.stdout).map((row) => ({
    name: row.Name,
    state: row.State,
    enabled: row.Enabled,
  }));
}

async function getOptimizationInsights() {
  const [admin, startup, services, junk, powerPlan, telemetryTasks] = await Promise.all([
    isAdmin(),
    getStartupItems(),
    getServiceStates(),
    scanJunk(),
    getCurrentPowerPlan(),
    getTelemetryTaskSummary(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    admin,
    startup,
    services,
    powerPlan,
    telemetryTasks,
    junkSummary: {
      totalBytes: junk.totalBytes,
      tempBytes: junk.temp.totalBytes,
      appCacheBytes: junk.appCaches.totalBytes,
      devJunkBytes: junk.devJunk.totalBytes,
    },
  };
}

async function executeOptimizationAction(action) {
  if (action.kind === "internal") {
    if (action.internal === "cleanup_temp_and_caches") {
      const report = await cleanupSelected({ includeTemp: true, includeAppCaches: true });
      return {
        ok: true,
        summary: `Deleted ${report.totals.deletedEntries} entries (${report.totals.deletedBytes} bytes).`,
      };
    }
    if (action.internal === "remove_empty_folders") {
      const report = await removeEmptyFolders();
      return {
        ok: true,
        summary: `Removed ${report.deleted} empty folders (failed: ${report.failed}).`,
      };
    }
    return { ok: false, error: "Unsupported internal action." };
  }

  const result = await runPowerShell(action.command, action.timeoutMs || 30000);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      stderr: result.stderr,
    };
  }
  return {
    ok: true,
    summary: result.stdout.trim() || "Command executed.",
  };
}

async function applyOptimizationPlan(actionIds, options = {}) {
  const dryRun = options.dryRun !== false;
  const admin = await isAdmin();

  const wanted = new Set(Array.isArray(actionIds) ? actionIds : []);
  const actions = OPTIMIZATION_ACTIONS.filter((action) => wanted.has(action.id));

  const results = [];
  for (const action of actions) {
    if (action.requiresAdmin && !admin) {
      results.push({
        id: action.id,
        title: action.title,
        status: "skipped_admin_required",
        ok: false,
        message: "Run app as Administrator to apply this action.",
      });
      continue;
    }

    if (dryRun) {
      results.push({
        id: action.id,
        title: action.title,
        status: "simulated",
        ok: true,
        message: "Dry run only, no system changes applied.",
      });
      continue;
    }

    const execution = await executeOptimizationAction(action);
    results.push({
      id: action.id,
      title: action.title,
      status: execution.ok ? "applied" : "failed",
      ok: execution.ok,
      message: execution.ok ? execution.summary : execution.error || "Unknown failure",
      stderr: execution.stderr || "",
    });
  }

  return {
    executedAt: new Date().toISOString(),
    dryRun,
    admin,
    totalRequested: actions.length,
    applied: results.filter((x) => x.status === "applied").length,
    simulated: results.filter((x) => x.status === "simulated").length,
    failed: results.filter((x) => x.status === "failed").length,
    skippedAdmin: results.filter((x) => x.status === "skipped_admin_required").length,
    results,
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
  ipcMain.handle("system:get-battery-details", async () => getBatteryDetails());
  ipcMain.handle("optimizer:get-catalog", async () => getOptimizationCatalog());
  ipcMain.handle("optimizer:get-insights", async () => getOptimizationInsights());
  ipcMain.handle("optimizer:apply-plan", async (_event, payload) => {
    const actionIds = payload && Array.isArray(payload.actionIds) ? payload.actionIds : [];
    return applyOptimizationPlan(actionIds, payload || {});
  });
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
