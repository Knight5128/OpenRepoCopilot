import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getOpenRepoHome,
  graphFile,
  jobFile,
  jobLogFile,
  jobsDir,
  projectDir,
  projectFile,
  projectsDir,
  settingsFile,
  sourceDir,
} from "./paths.js";
import { createAgentClient, readAgentCredential } from "./agent-client.js";
import { clonePublicGitHubRepo, parseGitHubRepoUrl } from "./github.js";
import { writeDocumentKnowledgeBase } from "./documents.js";
import { DEFAULT_AGENT_PROVIDER, isAgentProvider, providerPreset } from "./providers.js";
import type {
  OpenRepoAgentSettings,
  OpenRepoAgentStatus,
  OpenRepoJob,
  OpenRepoLanguage,
  OpenRepoProject,
  OpenRepoSettings,
  OpenRepoThemeMode,
  UploadedDocument,
} from "./types.js";

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
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    return normalizeSettings(raw, this.home);
  }

  writeSettings(input: Partial<OpenRepoSettings> | Record<string, unknown>): OpenRepoSettings {
    const current = this.readSettings();
    const rawInput = input as Record<string, unknown>;
    const next = normalizeSettings({
      ...current,
      ...rawInput,
      appearance: { ...current.appearance, ...recordValue(rawInput.appearance) },
      storage: { ...current.storage, ...recordValue(rawInput.storage) },
      agent: { ...current.agent, ...recordValue(rawInput.agent) },
    }, this.home);
    fs.mkdirSync(this.home, { recursive: true });
    fs.writeFileSync(settingsFile(this.home), `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  readAgentStatus(): OpenRepoAgentStatus {
    const settings = this.readSettings();
    const credential = readAgentCredential(settings.agent, this.home);
    return {
      apiKeyConfigured: Boolean(credential.apiKey),
      apiKeyFilePath: credential.apiKeyFilePath,
      activeApiKeyEnv: settings.agent.apiKeyEnv,
    };
  }

  async testAgentConnection(input?: Record<string, unknown>): Promise<void> {
    const settings = this.readSettings();
    const agent = normalizeAgentSettings({ ...settings.agent, ...input }, this.home);
    const client = createAgentClient(agent, this.home);
    await client.testConnection();
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
    const sourcePath = settings.storage.cloneRootPath
      ? path.join(settings.storage.cloneRootPath, id)
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
      queuePosition: this.nextQueuePosition(),
      phase: "queued",
      progress: 0,
      logPath: jobLogFile(project.id, "pending", this.home),
      createdAt: now,
      updatedAt: now,
      commandHint: "OpenRepoCopilot in-app analysis worker",
    };
    job.logPath = jobLogFile(project.id, job.id, this.home);
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
    const queued = this.listJobs(projectId)
      .filter((job) => job.status === "queued")
      .sort(compareQueueJobs)[0];
    if (!queued) throw new Error(`No queued analysis job for project: ${projectId}`);
    return this.updateJob(queued.id, { status: "in_progress", phase: "starting", progress: 1, startedAt: new Date().toISOString() });
  }

  completeJob(jobId: string): OpenRepoJob {
    return this.updateJob(jobId, { status: "completed", phase: "completed", progress: 100, completedAt: new Date().toISOString() });
  }

  failJob(jobId: string, error: string): OpenRepoJob {
    return this.updateJob(jobId, { status: "failed", phase: "failed", progress: 100, completedAt: new Date().toISOString(), error });
  }

  updateJobStatus(jobId: string, patch: Partial<OpenRepoJob>): OpenRepoJob {
    return this.updateJob(jobId, patch);
  }

  appendJobLog(jobId: string, line: string): void {
    const job = this.readJob(jobId);
    const file = job.logPath ?? jobLogFile(job.projectId, job.id, this.home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, "utf8");
  }

  readJobLog(jobId: string): string {
    const job = this.readJob(jobId);
    const file = job.logPath ?? jobLogFile(job.projectId, job.id, this.home);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  }

  writeProjectGraph(projectId: string, graph: unknown): void {
    const file = graphFile(projectId, this.home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  }

  deleteJob(jobId: string): void {
    const job = this.readJob(jobId);
    const file = jobFile(job.projectId, job.id, this.home);
    fs.unlinkSync(file);
    const project = this.readProject(job.projectId);
    if (project.latestJobId === jobId) {
      this.writeProject({
        ...project,
        latestJobId: this.listJobs(job.projectId)[0]?.id,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  deleteProject(projectId: string): void {
    const project = this.readProject(projectId);
    const activeJob = this.listJobs(projectId).find((job) => job.status === "queued" || job.status === "in_progress");
    if (activeJob) {
      throw new Error("Cannot delete a project while an analysis job is queued or running.");
    }

    const dir = projectDir(project.id, this.home);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  reorderJobs(jobIds: string[]): OpenRepoJob[] {
    const seen = new Set<string>();
    const orderedIds = jobIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return orderedIds.map((id, index) => this.updateJob(id, { queuePosition: index + 1 }));
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

  private nextQueuePosition(): number {
    let maxPosition = 0;
    for (const project of this.listProjects()) {
      for (const job of this.listJobs(project.id)) {
        const position = job.queuePosition ?? Date.parse(job.createdAt);
        maxPosition = Math.max(maxPosition, Number.isFinite(position) ? position : 0);
      }
    }
    return maxPosition + 1;
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

function compareQueueJobs(a: OpenRepoJob, b: OpenRepoJob): number {
  const parsedA = a.queuePosition ?? Date.parse(a.createdAt);
  const parsedB = b.queuePosition ?? Date.parse(b.createdAt);
  const aPosition = Number.isFinite(parsedA) ? parsedA : 0;
  const bPosition = Number.isFinite(parsedB) ? parsedB : 0;
  if (aPosition !== bPosition) return aPosition - bPosition;
  return a.createdAt.localeCompare(b.createdAt);
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

export function defaultSettings(home: string): OpenRepoSettings {
  const preset = providerPreset(DEFAULT_AGENT_PROVIDER);
  return {
    appearance: {
      themeMode: "system",
      language: "en",
    },
    storage: {
      cloneRootPath: path.join(home, "clones"),
      graphExportPath: path.join(home, "exports"),
    },
    agent: {
      provider: preset.id,
      model: preset.model,
      baseUrl: preset.baseUrl,
      apiKeyEnv: preset.apiKeyEnv,
      autoRunJobs: true,
      requestTimeout: 120000,
      maxConcurrency: 2,
    },
  };
}

export function normalizeSettings(input: Record<string, unknown>, home: string): OpenRepoSettings {
  const defaults = defaultSettings(home);
  const appearanceInput = recordValue(input.appearance);
  const storageInput = recordValue(input.storage);
  const agentInput = recordValue(input.agent);
  return {
    appearance: {
      themeMode: normalizeThemeMode(appearanceInput.themeMode ?? input.themeMode, defaults.appearance.themeMode),
      language: normalizeLanguage(appearanceInput.language ?? input.language, defaults.appearance.language),
    },
    storage: {
      cloneRootPath: path.resolve(String(storageInput.cloneRootPath ?? input.cloneRootPath ?? defaults.storage.cloneRootPath)),
      graphExportPath: path.resolve(String(storageInput.graphExportPath ?? input.graphExportPath ?? defaults.storage.graphExportPath)),
    },
    agent: normalizeAgentSettings({
      ...defaults.agent,
      ...agentInput,
      baseUrl: agentInput.baseUrl ?? input.agentApiBaseUrl ?? defaults.agent.baseUrl,
      apiKeyEnv: agentInput.apiKeyEnv ?? input.agentApiKeyEnv ?? defaults.agent.apiKeyEnv,
    }, home),
  };
}

function normalizeAgentSettings(input: Record<string, unknown>, _home: string): OpenRepoAgentSettings {
  const provider = isAgentProvider(input.provider) ? input.provider : DEFAULT_AGENT_PROVIDER;
  const preset = providerPreset(provider);
  const requestTimeout = Number(input.requestTimeout);
  const maxConcurrency = Number(input.maxConcurrency);
  return {
    provider,
    model: nonEmptyString(input.model, preset.model),
    baseUrl: normalizeBaseUrl(nonEmptyString(input.baseUrl, preset.baseUrl)),
    apiKeyEnv: nonEmptyString(input.apiKeyEnv, preset.apiKeyEnv),
    autoRunJobs: typeof input.autoRunJobs === "boolean" ? input.autoRunJobs : true,
    requestTimeout: Number.isFinite(requestTimeout) && requestTimeout >= 1000 ? Math.floor(requestTimeout) : 120000,
    maxConcurrency: Number.isFinite(maxConcurrency) && maxConcurrency >= 1 ? Math.floor(maxConcurrency) : 2,
  };
}

function normalizeThemeMode(input: unknown, fallback: OpenRepoThemeMode): OpenRepoThemeMode {
  return input === "light" || input === "dark" || input === "system" ? input : fallback;
}

function normalizeLanguage(input: unknown, fallback: OpenRepoLanguage): OpenRepoLanguage {
  return input === "zh" || input === "en" || input === "ja" ? input : fallback;
}

function recordValue(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function nonEmptyString(input: unknown, fallback: string): string {
  const value = typeof input === "string" ? input.trim() : "";
  return value || fallback;
}

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}
