import os from "node:os";
import path from "node:path";

export function getOpenRepoHome(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.OPENREPO_HOME || path.join(os.homedir(), ".openrepo-copilot"));
}

export function projectsDir(home = getOpenRepoHome()): string {
  return path.join(home, "projects");
}

export function settingsFile(home = getOpenRepoHome()): string {
  return path.join(home, "settings.json");
}

export function agentEnvFile(home = getOpenRepoHome()): string {
  return path.join(home, "agent.env");
}

export function projectDir(projectId: string, home = getOpenRepoHome()): string {
  return path.join(projectsDir(home), projectId);
}

export function projectFile(projectId: string, home = getOpenRepoHome()): string {
  return path.join(projectDir(projectId, home), "project.json");
}

export function jobsDir(projectId: string, home = getOpenRepoHome()): string {
  return path.join(projectDir(projectId, home), "jobs");
}

export function jobFile(projectId: string, jobId: string, home = getOpenRepoHome()): string {
  return path.join(jobsDir(projectId, home), `${jobId}.json`);
}

export function jobLogFile(projectId: string, jobId: string, home = getOpenRepoHome()): string {
  return path.join(jobsDir(projectId, home), `${jobId}.log`);
}

export function sourceDir(projectId: string, home = getOpenRepoHome()): string {
  return path.join(projectDir(projectId, home), "source");
}

export function graphFile(projectId: string, home = getOpenRepoHome()): string {
  return path.join(projectDir(projectId, home), ".understand-anything", "knowledge-graph.json");
}
