---
name: openrepo-package
description: Package OpenRepoCopilot app release artifacts. Use when Codex needs to build the current OpenRepoCopilot app version, create a local release zip, validate package output, or prepare OpenRepoCopilot for teammate distribution without publishing generated artifacts.
---

# OpenRepoCopilot Packaging

## Overview

Build the OpenRepoCopilot app packages and create a local zip under `release/`. The generated `release/` directory is ignored by Git and should not be committed.

## Workflow

1. Start from the repository root containing `package.json`.
2. Run the one-command package flow:

   ```bash
   pnpm package:app
   ```

3. Confirm the command reports both outputs:
   - `release/openrepo-copilot-app-<timestamp>/`
   - `release/openrepo-copilot-app-<timestamp>.zip`

## What The Package Contains

- Git-tracked project files, excluding ignored local files such as `.private/`, `node_modules/`, `.env*`, and `release/`.
- Built outputs for:
  - `understand-anything-plugin/packages/core/dist`
  - `understand-anything-plugin/packages/openrepo/dist`
  - `understand-anything-plugin/packages/dashboard/dist`
- `package-manifest.json` with the package timestamp and included build output paths.

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
