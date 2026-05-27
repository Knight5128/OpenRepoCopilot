import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getOpenRepoHome,
  graphFile,
  jobFile,
  jobsDir,
  projectDir,
  projectFile,
  projectsDir,
  settingsFile,
  sourceDir,
} from "./paths.js";
import { clonePublicGitHubRepo, parseGitHubRepoUrl } from "./github.js";
import { writeDocumentKnowledgeBase } from "./documents.js";
import type { OpenRepoJob, OpenRepoProject, OpenRepoSettings, UploadedDocument } from "./types.js";

export interface OpenRepoStoreOptions {
  home?: string;
}

export interface CreateGithubProjectOptions {
  clone?: boolean;
}

export class OpenRepoStore {
  readonly home: string;

  constructor(options: OpenRepoStoreOptions = {}) {
    this.home = options.home ? path.resolve(options.home) : getOpenRepoHome();
  }

  ensureHome(): void {
    fs.mkdirSync(projectsDir(this.home), { recursive: true });
  }

  readSettings(): OpenRepoSettings {
    this.ensureHome();
    const file = settingsFile(this.home);
    if (!fs.existsSync(file)) return defaultSettings(this.home);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<OpenRepoSettings>;
    return normalizeSettings({ ...defaultSettings(this.home), ...raw }, this.home);
  }

  writeSettings(input: Partial<OpenRepoSettings>): OpenRepoSettings {
    const next = normalizeSettings({ ...this.readSettings(), ...input }, this.home);
    fs.mkdirSync(this.home, { recursive: true });
    fs.writeFileSync(settingsFile(this.home), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  listProjects(): OpenRepoProject[] {
    this.ensureHome();
    return fs
      .readdirSync(projectsDir(this.home), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.tryReadProject(entry.name))
      .filter((project): project is OpenRepoProject => project !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  readProject(projectId: string): OpenRepoProject {
    const project = this.tryReadProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return project;
  }

  tryReadProject(projectId: string): OpenRepoProject | null {
    const file = projectFile(projectId, this.home);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as OpenRepoProject;
  }

  async createGithubProject(inputUrl: string, options: CreateGithubProjectOptions = {}): Promise<OpenRepoProject> {
    const parsed = parseGitHubRepoUrl(inputUrl);
    const duplicate = this.listProjects().find(
      (project) => project.type === "github_repo" && project.source.type === "github_repo" && project.source.url === parsed.normalizedUrl,
    );
    if (duplicate) throw new Error(`Project already exists for ${parsed.normalizedUrl}: ${duplicate.id}`);

    const id = this.uniqueProjectId(`${parsed.owner}-${parsed.repo}`);
    const now = new Date().toISOString();
    const dir = projectDir(id, this.home);
    const settings = this.readSettings();
    const sourcePath = settings.cloneRootPath
      ? path.join(settings.cloneRootPath, id)
      : sourceDir(id, this.home);
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(jobsDir(id, this.home), { recursive: true });

    if (options.clone !== false) {
      await clonePublicGitHubRepo(parsed, sourcePath);
    }

    const project: OpenRepoProject = {
      id,
      name: `${parsed.owner}/${parsed.repo}`,
      type: "github_repo",
      createdAt: now,
      updatedAt: now,
      sourcePath,
      graphPath: graphFile(id, this.home),
      source: {
        type: "github_repo",
        url: parsed.normalizedUrl,
        owner: parsed.owner,
        repo: parsed.repo,
      },
    };
    fs.mkdirSync(dir, { recursive: true });
    this.writeProject(project);
    return project;
  }

  createDocumentProject(name: string, files: UploadedDocument[]): OpenRepoProject {
    const normalizedName = name.trim() || "Document Knowledge Base";
    const id = this.uniqueProjectId(normalizedName);
    const now = new Date().toISOString();
    const dir = projectDir(id, this.home);
    const sourcePath = sourceDir(id, this.home);
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(jobsDir(id, this.home), { recursive: true });
    const documentNames = writeDocumentKnowledgeBase(files, sourcePath);

    const project: OpenRepoProject = {
      id,
      name: normalizedName,
      type: "document_kb",
      createdAt: now,
      updatedAt: now,
      sourcePath,
      graphPath: graphFile(id, this.home),
      source: {
        type: "document_kb",
        documentNames,
      },
    };
    fs.mkdirSync(dir, { recursive: true });
    this.writeProject(project);
    return project;
  }

  createAnalysisJob(projectId: string): OpenRepoJob {
    const project = this.readProject(projectId);
    const now = new Date().toISOString();
    const job: OpenRepoJob = {
      id: randomUUID(),
      projectId,
      kind: project.type === "github_repo" ? "code" : "knowledge",
      status: "queued",
      createdAt: now,
      updatedAt: now,
      commandHint: `/openrepo-analyze ${projectId}`,
    };
    this.writeJob(job);
    this.writeProject({ ...project, latestJobId: job.id, updatedAt: now });
    return job;
  }

  listJobs(projectId: string): OpenRepoJob[] {
    const dir = jobsDir(projectId, this.home);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as OpenRepoJob)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  readJob(jobId: string): OpenRepoJob {
    for (const project of this.listProjects()) {
      const file = jobFile(project.id, jobId, this.home);
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as OpenRepoJob;
    }
    throw new Error(`Job not found: ${jobId}`);
  }

  claimNextJob(projectId: string): OpenRepoJob {
    const queued = this.listJobs(projectId).reverse().find((job) => job.status === "queued");
    if (!queued) throw new Error(`No queued analysis job for project: ${projectId}`);
    return this.updateJob(queued.id, { status: "in_progress", startedAt: new Date().toISOString() });
  }

  completeJob(jobId: string): OpenRepoJob {
    return this.updateJob(jobId, { status: "completed", completedAt: new Date().toISOString() });
  }

  failJob(jobId: string, error: string): OpenRepoJob {
    return this.updateJob(jobId, { status: "failed", completedAt: new Date().toISOString(), error });
  }

  readGraph(projectId: string): unknown {
    const file = graphFile(projectId, this.home);
    if (!fs.existsSync(file)) throw new Error("No knowledge graph found for this project.");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  readOptionalJson(projectId: string, fileName: string): unknown | null {
    const file = path.join(projectDir(projectId, this.home), ".understand-anything", fileName);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  readSourceFile(projectId: string, requestedPath: string): { path: string; language: string; content: string; sizeBytes: number; lineCount: number } {
    const project = this.readProject(projectId);
    const safePath = normalizeRelativePath(requestedPath);
    const absolutePath = path.resolve(project.sourcePath, safePath);
    const relative = path.relative(project.sourcePath, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Path must stay inside the project source.");
    }
    const buffer = fs.readFileSync(absolutePath);
    if (buffer.includes(0)) throw new Error("Binary files cannot be previewed.");
    const content = buffer.toString("utf8");
    return {
      path: relative.split(path.sep).join("/"),
      language: languageFromPath(relative),
      content,
      sizeBytes: buffer.byteLength,
      lineCount: content.length === 0 ? 0 : content.split(/\r\n|\n|\r/).length,
    };
  }

  private updateJob(jobId: string, patch: Partial<OpenRepoJob>): OpenRepoJob {
    const current = this.readJob(jobId);
    const next: OpenRepoJob = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.writeJob(next);
    return next;
  }

  private writeProject(project: OpenRepoProject): void {
    fs.mkdirSync(projectDir(project.id, this.home), { recursive: true });
    fs.writeFileSync(projectFile(project.id, this.home), `${JSON.stringify(project, null, 2)}\n`, "utf8");
  }

  private writeJob(job: OpenRepoJob): void {
    fs.mkdirSync(jobsDir(job.projectId, this.home), { recursive: true });
    fs.writeFileSync(jobFile(job.projectId, job.id, this.home), `${JSON.stringify(job, null, 2)}\n`, "utf8");
  }

  private uniqueProjectId(seed: string): string {
    this.ensureHome();
    const base = slugify(seed);
    let id = base;
    let counter = 2;
    while (fs.existsSync(projectDir(id, this.home))) {
      id = `${base}-${counter}`;
      counter += 1;
    }
    return id;
  }
}

function slugify(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `project-${Date.now()}`;
}

function normalizeRelativePath(input: string): string {
  if (!input || input.includes("\0") || path.isAbsolute(input)) {
    throw new Error("Invalid file path.");
  }
  const normalized = path.normalize(input);
  if (normalized === "." || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error("Path must stay inside the project source.");
  }
  return normalized;
}

function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const byExt: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    md: "markdown",
    txt: "text",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
  };
  return byExt[ext] ?? "text";
}

function defaultSettings(home: string): OpenRepoSettings {
  return {
    themeMode: "system",
    agentApiBaseUrl: "http://127.0.0.1:5173/api",
    agentApiKeyEnv: "OPENREPO_AGENT_API_KEY",
    cloneRootPath: path.join(home, "clones"),
    graphExportPath: path.join(home, "exports"),
  };
}

function normalizeSettings(input: OpenRepoSettings, home: string): OpenRepoSettings {
  const themeMode = input.themeMode === "light" || input.themeMode === "dark" || input.themeMode === "system"
    ? input.themeMode
    : "system";
  return {
    themeMode,
    agentApiBaseUrl: String(input.agentApiBaseUrl || defaultSettings(home).agentApiBaseUrl).trim(),
    agentApiKeyEnv: String(input.agentApiKeyEnv || defaultSettings(home).agentApiKeyEnv).trim(),
    cloneRootPath: path.resolve(String(input.cloneRootPath || defaultSettings(home).cloneRootPath)),
    graphExportPath: path.resolve(String(input.graphExportPath || defaultSettings(home).graphExportPath)),
  };
}
