#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OpenRepoStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  const store = new OpenRepoStore();

  switch (command) {
    case "ui":
      await startUi();
      return;
    case "projects":
      printJson({ projects: store.listProjects() });
      return;
    case "project":
      printJson({ project: store.readProject(required(args[0], "project id")), jobs: store.listJobs(args[0]) });
      return;
    case "queue":
      printJson({ job: store.createAnalysisJob(required(args[0], "project id")) });
      return;
    case "job-start": {
      const projectId = required(args[0], "project id");
      const job = store.claimNextJob(projectId);
      const project = store.readProject(projectId);
      printJson({ project, job, instructions: analysisInstructions(project.type, project.sourcePath, job.id) });
      return;
    }
    case "job-complete":
      printJson({ job: store.completeJob(required(args[0], "job id")) });
      return;
    case "job-fail":
      printJson({ job: store.failJob(required(args[0], "job id"), args.slice(1).join(" ") || "Analysis failed.") });
      return;
    case "help":
    case undefined:
      usage();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function startUi(): Promise<void> {
  const pluginRoot = path.resolve(__dirname, "..", "..");
  const dashboardDir = path.join(pluginRoot, "dashboard");
  const child = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["--dir", dashboardDir, "dev", "--host", "127.0.0.1"],
    {
      cwd: dashboardDir,
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_OPENREPO_MODE: "true",
      },
    },
  );

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`OpenRepo UI exited with code ${code}`));
    });
  });
}

function analysisInstructions(type: string, sourcePath: string, jobId: string): string[] {
  if (type === "github_repo") {
    return [
      `cd "${sourcePath}"`,
      "Run the existing /understand analysis flow for this project.",
      `After .understand-anything/knowledge-graph.json exists, copy .understand-anything into the OpenRepo project directory if the analyzer wrote it under source, then run: openrepo job-complete ${jobId}`,
    ];
  }
  return [
    `Run /understand-knowledge "${sourcePath}" using the existing knowledge-base flow.`,
    `After knowledge-graph.json is written, place it under the OpenRepo project .understand-anything directory, then run: openrepo job-complete ${jobId}`,
  ];
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write(`OpenRepoCopilot CLI

Usage:
  openrepo ui                    Start the local workbench
  openrepo projects              List projects
  openrepo project <id>          Show project and jobs
  openrepo queue <id>            Queue an analysis job
  openrepo job-start <id>        Claim the next queued job for an Agent command
  openrepo job-complete <job>    Mark a job completed
  openrepo job-fail <job> <msg>  Mark a job failed
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
