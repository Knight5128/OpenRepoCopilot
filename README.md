# OpenRepoCopilot

OpenRepoCopilot is a local-first AI repository and knowledge-base workbench. It turns public GitHub repositories, document collections, and existing project graphs into an interactive knowledge graph you can explore, search, and use for onboarding or review.

The project is based on a multi-agent code analysis pipeline, but the product surface is OpenRepoCopilot: a local workbench, queue-based analysis jobs, and a dashboard for repository understanding.

## What It Does

- Creates local OpenRepoCopilot projects from public GitHub repositories.
- Imports document knowledge bases from `.md`, `.txt`, `.pdf`, and `.docx` files.
- Queues analysis jobs that an AI coding agent can execute in the current environment.
- Generates and serves knowledge graphs from `.understand-anything/knowledge-graph.json`.
- Opens a web dashboard for graph search, filtering, node details, guided tours, and domain views.
- Stores project state locally under `OPENREPO_HOME` or `~/.openrepo-copilot`.

## Repository Layout

```text
.
├── understand-anything-plugin/
│   ├── packages/
│   │   ├── openrepo/      # OpenRepoCopilot local server, store, and CLI
│   │   ├── dashboard/     # Interactive graph dashboard and workbench UI
│   │   └── core/          # Graph schema, analysis helpers, persistence
│   ├── skills/
│   │   ├── openrepo/      # Starts the local OpenRepoCopilot workbench
│   │   ├── openrepo-analyze/
│   │   └── understand*/   # Compatibility analysis skills used by jobs
│   └── agents/            # Analysis agents used by the graph pipeline
├── homepage/              # Public-facing Astro site
├── scripts/               # Utility scripts
└── tests/                 # Skill-level tests
```

Some internal package names and compatibility paths still use the historical `understand-anything` namespace. Those names are implementation details for build compatibility and graph storage, not the user-facing product name.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Build the packages needed by the local workbench:

```bash
pnpm --filter @understand-anything/core build
pnpm --filter @openrepo-copilot/server build
pnpm --filter @understand-anything/dashboard build
```

Start the OpenRepoCopilot workbench:

```powershell
New-Item -ItemType Directory -Force .openrepo-dev
$env:OPENREPO_HOME = (Resolve-Path .openrepo-dev).Path
$env:OPENREPO_NO_OPEN = "true"
$env:VITE_OPENREPO_MODE = "true"
pnpm --filter @understand-anything/dashboard dev -- --host 127.0.0.1
```

This starts the full local workbench through the dashboard dev server with the OpenRepoCopilot API middleware enabled. Open the URL printed in the terminal, usually:

```text
http://127.0.0.1:5173/
```

## Agent Commands

When installed as an agent plugin, OpenRepoCopilot exposes these commands:

```bash
/openrepo
```

Starts the local workbench.

```bash
/openrepo-analyze <project-id>
```

Claims the next queued analysis job for a project and runs the repository or document analysis flow.

Compatibility commands are still available for the underlying graph pipeline:

```bash
/understand
/understand-dashboard
/understand-chat
/understand-diff
/understand-explain
/understand-onboard
/understand-domain
/understand-knowledge
```

## Typical Workflow

1. Run `/openrepo` or start the CLI with `node understand-anything-plugin/packages/openrepo/dist/cli.js ui`.
2. Create a project from a public GitHub repository or upload document files.
3. Queue an analysis job from the workbench.
4. Run `/openrepo-analyze <project-id>` in your agent environment.
5. Open the generated graph from the workbench.

## Local Data

OpenRepoCopilot stores local project metadata, cloned repositories, imported documents, jobs, and generated graph files in:

```text
~/.openrepo-copilot
```

Set `OPENREPO_HOME` to use another location:

```bash
OPENREPO_HOME=/path/to/openrepo-data node understand-anything-plugin/packages/openrepo/dist/cli.js ui
```

## Agent API Configuration

OpenRepoCopilot defaults to GLM-5.1 through Alibaba Cloud Bailian / DashScope compatible mode:

```text
Provider: DashScope / Alibaba Bailian
Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
Model: glm-5.1
API key env: DASHSCOPE_API_KEY
```

The workbench also includes presets for ZhipuAI, OpenAI, DeepSeek, OpenRouter, and custom OpenAI-compatible APIs. API keys are never stored in `settings.json` and should not be packaged into the app. Put them in the process environment or in:

```text
<OPENREPO_HOME>/agent.env
```

If `OPENREPO_HOME` is unset, the default Windows path is:

```text
%USERPROFILE%\.openrepo-copilot\agent.env
```

Example `agent.env`:

```env
DASHSCOPE_API_KEY=your-dashscope-api-key
ZHIPUAI_API_KEY=your-zhipuai-api-key
OPENAI_API_KEY=your-openai-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key
OPENROUTER_API_KEY=your-openrouter-api-key
OPENREPO_AGENT_API_KEY=your-custom-provider-api-key
```

Generated graph artifacts use the compatibility directory:

```text
.understand-anything/
```

Commit the graph directory when you want teammates to reuse a generated graph without rerunning the full analysis. Do not commit local scratch files:

```gitignore
.understand-anything/intermediate/
.understand-anything/tmp/
.understand-anything/diff-overlay.json
```

## Development

Run the fastest relevant checks for package changes:

```bash
pnpm --filter @openrepo-copilot/server test
pnpm --filter @understand-anything/core test
pnpm --filter @understand-anything/dashboard build
```

Root-level tests:

```bash
pnpm test
```

Dashboard development:

```bash
pnpm --filter @understand-anything/dashboard dev
```

Homepage development:

```bash
pnpm --dir homepage dev
```

## Notes For Maintainers

- Keep user-facing names as `OpenRepoCopilot`.
- Treat `understand-anything-plugin`, `@understand-anything/*`, and `.understand-anything/` as compatibility names unless a coordinated migration updates imports, lockfiles, installers, and generated graph paths together.
- Avoid adding network calls beyond explicit repository clone/import flows.
- Prefer small, reviewable diffs and keep compatibility commands stable while the native OpenRepoCopilot surface evolves.

## License

MIT
