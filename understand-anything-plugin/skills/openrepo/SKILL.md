---
name: openrepo
description: Start the OpenRepoCopilot local workbench for public GitHub repository and document knowledge-base projects
argument-hint: none
---

# /openrepo

Start the OpenRepoCopilot local workbench.

## Instructions

1. Resolve the plugin root. Check these locations in order and use the first directory containing `packages/openrepo/package.json`:
   - `${CLAUDE_PLUGIN_ROOT}`
   - `~/.understand-anything-plugin`
   - Two levels up from `~/.agents/skills/openrepo`
   - Two levels up from `~/.copilot/skills/openrepo`
   - `~/.codex/understand-anything/understand-anything-plugin`
   - `~/.opencode/understand-anything/understand-anything-plugin`
   - `~/understand-anything/understand-anything-plugin`

2. Build the local CLI if needed:

   ```bash
   cd <plugin-root> && pnpm install --frozen-lockfile 2>/dev/null || pnpm install
   cd <plugin-root> && pnpm --filter @openrepo-copilot/server build
   ```

3. Start the workbench:

   ```bash
   cd <plugin-root> && node packages/openrepo/dist/cli.js ui
   ```

4. Report the URL printed by the command. It should look like:

   ```text
   http://127.0.0.1:5173/
   ```

## Notes

- The workbench is local-only and binds to `127.0.0.1`.
- `OPENREPO_HOME` controls project storage. If it is unset, projects are stored in `~/.openrepo-copilot`.
