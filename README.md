# Nexus AI PC Cleaner (Electron MVP)

This repository now contains an end-to-end Electron application scaffold based on the PRD in `PRD.md`.

## What is implemented now

- Desktop app shell with secure Electron architecture:
  - `main` process logic in `src/main/main.js`
  - context-isolated IPC bridge in `src/main/preload.js`
  - renderer UI in `src/renderer/*`
- System overview telemetry:
  - CPU usage estimate
  - RAM usage
  - disk info (Windows logical drives)
  - battery status when available
  - admin vs non-admin mode detection
- Storage optimization features:
  - temp folder scan
  - app cache scan (Slack, Discord, Spotify, VS Code, Photoshop paths when present)
  - development junk scan (`.terraform`, `.gradle`, `__pycache__`, lock files, etc.)
  - empty folder scan across user workspace roots
- Cleanup execution:
  - clears contents of temp folders and known app caches
  - explicit confirmation in UI before action
- Responsive, themed "Nexus Architect" dashboard UI
- Optimization Engine modules (scripted automation layer):
  - service/process optimization actions
  - privacy/telemetry actions
  - startup optimization actions
  - UWP debloat action pack
  - cleanup actions (temp/cache + empty folder deletion)
  - registry responsiveness actions
  - network actions (DNS flush / optional DNS switch)
  - feature control actions (Copilot toggle)
  - dry-run simulation, recommended profile, and selected-action execution

## Quick start

1. Install dependencies:

```powershell
npm install
```

2. Run app:

```powershell
npm run dev
```

## Notes

- Current build prioritizes safe and auditable operations.
- Deep registry/service/kernel tasks from PRD are not yet implemented in this first MVP pass.
- Some actions may require running the app as Administrator for full effect.

## Suggested next implementation milestones

1. Privileged worker module for service tuning and PATH cleanup.
2. Registry analyzer with backup/restore snapshots.
3. SSD/NVMe health and thermal telemetry integration.
4. Privacy hardening module (telemetry and background app policy controls).
5. Production packaging (code signing, installer, update strategy).
#
