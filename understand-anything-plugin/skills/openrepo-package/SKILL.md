---
name: openrepo-package
description: Package OpenRepoCopilot app release artifacts. Use when Codex needs to build the current OpenRepoCopilot app version, create a local release zip, validate package output, or prepare OpenRepoCopilot for teammate distribution without publishing generated artifacts.
---

# OpenRepoCopilot Packaging

## Overview

Build the OpenRepoCopilot app packages and create a local zip under `release/`. The generated `release/` directory is ignored by Git and should not be committed.

On Windows, the package flow can also compile an Inno Setup installer so website users can choose an install location and get Start Menu/Desktop shortcuts plus standard uninstall support.

## Workflow

1. Start from the repository root containing `package.json`.
2. Run the one-command package flow:

   ```bash
   pnpm package:app
   ```

3. Confirm the command reports both outputs:
   - `release/openrepo-copilot-app-<timestamp>/`
   - `release/openrepo-copilot-app-<timestamp>.zip`

## Windows Installer Workflow

1. Install Inno Setup 6 and make sure `ISCC.exe` is on `PATH`, or set `INNO_SETUP_COMPILER` to the full `ISCC.exe` path.
2. Run:

   ```bash
   pnpm package:app:win-installer
   ```

3. Confirm the command reports:
   - `release/OpenRepoCopilot-Setup-<timestamp>.exe`

The installer uses the normal `package:app` staging output, installs files under the user-selected directory, creates a Start Menu shortcut, offers an optional desktop shortcut, and registers an uninstaller.

The Windows launcher starts an Electron shell. It opens the local OpenRepoCopilot dashboard in a standalone app window and creates a system tray icon; closing the window hides it to the tray, while the tray menu can show, hide, reload, or quit the app.

The generated installer is not yet a self-contained native desktop runtime. User machines still need Node.js LTS/Corepack; the first launch installs runtime dependencies in the selected install directory with `corepack pnpm install --frozen-lockfile`.

## What The Package Contains

- Git-tracked project files, excluding ignored local files such as `.private/`, `node_modules/`, `.env*`, and `release/`.
- Built outputs for:
  - `understand-anything-plugin/packages/core/dist`
  - `understand-anything-plugin/packages/openrepo/dist`
  - `understand-anything-plugin/packages/dashboard/dist`
- `package-manifest.json` with the package timestamp and included build output paths.
- `scripts/windows/OpenRepoCopilot.cmd`, the Windows shortcut target used by the installer to start the local workbench.
- `assets/openrepo-copilot-logo.svg`, `.png`, `.ico`, and `assets/openrepo-copilot-tray.png`, used for the app window, installer, and tray icon.

## Validation

If packaging fails, fix the first failed build step before rerunning. Prefer the fastest relevant command:

```bash
pnpm --filter @understand-anything/core build
pnpm --filter @openrepo-copilot/server build
pnpm --filter @understand-anything/dashboard build
```

Do not commit generated `release/` artifacts unless the user explicitly asks for release binaries to be versioned.

## GitHub Upload

Packaging and GitHub publishing are separate tasks. Before pushing, make sure `release/` and `.private/` remain untracked.
