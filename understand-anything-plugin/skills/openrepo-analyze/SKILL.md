---
name: openrepo-analyze
description: Run an OpenRepoCopilot queued analysis job by delegating to the existing Understand-Anything analysis flow
argument-hint: <project-id>
---

# /openrepo-analyze

Consume the next queued OpenRepoCopilot analysis job for a project and run the existing Understand-Anything analysis flow.

## Instructions

1. Require a project id in `$ARGUMENTS`. If it is missing, ask the user to copy the project id from the OpenRepoCopilot workbench.

2. Resolve the plugin root. Check these locations in order and use the first directory containing `packages/openrepo/package.json`:
   - `${CLAUDE_PLUGIN_ROOT}`
   - `~/.understand-anything-plugin`
   - Two levels up from `~/.agents/skills/openrepo-analyze`
   - Two levels up from `~/.copilot/skills/openrepo-analyze`
   - `~/.codex/understand-anything/understand-anything-plugin`
   - `~/.opencode/understand-anything/understand-anything-plugin`
   - `~/understand-anything/understand-anything-plugin`

3. Ensure the OpenRepo CLI is built:

   ```bash
   cd <plugin-root> && pnpm --filter @openrepo-copilot/server build
   ```

4. Claim the next queued job and inspect the returned JSON:

   ```bash
   cd <plugin-root> && node packages/openrepo/dist/cli.js job-start <project-id>
   ```

5. If the returned project type is `github_repo`, change to `project.sourcePath` and run the existing `/understand` workflow for that repository. If the graph is written under `project.sourcePath/.understand-anything`, copy that `.understand-anything` directory into the OpenRepo project directory shown by `project.graphPath`.

6. If the returned project type is `document_kb`, run the existing `/understand-knowledge <project.sourcePath>` workflow. Ensure the resulting `knowledge-graph.json` is placed at the returned `project.graphPath`.

7. When the graph exists at `project.graphPath`, mark the job complete:

   ```bash
   cd <plugin-root> && node packages/openrepo/dist/cli.js job-complete <job-id>
   ```

8. If analysis fails, mark the job failed:

   ```bash
   cd <plugin-root> && node packages/openrepo/dist/cli.js job-fail <job-id> "<short error>"
   ```

## Notes

- Do not ask the user for an API key. This command relies on the current Agent environment to perform the LLM-backed analysis steps.
- Do not analyze multiple OpenRepo projects at once.
