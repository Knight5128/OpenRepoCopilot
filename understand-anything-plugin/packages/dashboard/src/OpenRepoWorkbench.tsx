import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type ProjectType = "github_repo" | "document_kb";
type JobStatus = "queued" | "in_progress" | "completed" | "failed";
type WorkbenchView = "overview" | "create" | "project" | "settings";
type ThemeMode = "light" | "dark" | "system";

interface OpenRepoProject {
  id: string;
  name: string;
  type: ProjectType;
  createdAt: string;
  updatedAt: string;
  sourcePath: string;
  graphPath: string;
  latestJobId?: string;
  source: { type: "github_repo"; url: string } | { type: "document_kb"; documentNames: string[] };
}

interface OpenRepoJob {
  id: string;
  projectId: string;
  status: JobStatus;
  commandHint: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

interface ProjectDetails {
  project: OpenRepoProject;
  jobs: OpenRepoJob[];
}

interface OpenRepoSettings {
  themeMode: ThemeMode;
  agentApiBaseUrl: string;
  agentApiKeyEnv: string;
  cloneRootPath: string;
  graphExportPath: string;
}

const fallbackSettings: OpenRepoSettings = {
  themeMode: "system",
  agentApiBaseUrl: "http://127.0.0.1:5173/api",
  agentApiKeyEnv: "OPENREPO_AGENT_API_KEY",
  cloneRootPath: "",
  graphExportPath: "",
};

export default function OpenRepoWorkbench() {
  const [projects, setProjects] = useState<OpenRepoProject[]>([]);
  const [details, setDetails] = useState<Record<string, ProjectDetails>>({});
  const [settings, setSettings] = useState<OpenRepoSettings>(fallbackSettings);
  const [settingsDraft, setSettingsDraft] = useState<OpenRepoSettings>(fallbackSettings);
  const [githubUrl, setGithubUrl] = useState("");
  const [documentName, setDocumentName] = useState("Document Knowledge Base");
  const [documentFiles, setDocumentFiles] = useState<FileList | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectType>("github_repo");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [view, setView] = useState<WorkbenchView>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [projectsData, settingsData] = await Promise.all([
      api<{ projects: OpenRepoProject[] }>("/api/projects"),
      api<{ settings: OpenRepoSettings }>("/api/settings"),
    ]);
    setProjects(projectsData.projects);
    setSettings(settingsData.settings);
    setSettingsDraft(settingsData.settings);
    const entries = await Promise.all(
      projectsData.projects.map(async (project) => [project.id, await api<ProjectDetails>(`/api/projects/${project.id}`)] as const),
    );
    setDetails(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) => setError(errorMessage(err)));
  }, [refresh]);

  useEffect(() => {
    applyTheme(settings.themeMode);
  }, [settings.themeMode]);

  const latestJobs = useMemo(() => {
    const result: Record<string, OpenRepoJob | undefined> = {};
    for (const project of projects) result[project.id] = details[project.id]?.jobs[0];
    return result;
  }, [details, projects]);

  const selectedProject = selectedProjectId ? details[selectedProjectId]?.project : undefined;
  const selectedJobs = selectedProjectId ? details[selectedProjectId]?.jobs ?? [] : [];

  function showCreate() {
    setView("create");
    setSelectedProjectId(null);
    setNotice(null);
  }

  function showProject(projectId: string) {
    setSelectedProjectId(projectId);
    setView("project");
    setNotice(null);
  }

  async function createGithubProject(event: FormEvent) {
    event.preventDefault();
    setBusy("github");
    setError(null);
    setNotice(null);
    try {
      const data = await api<{ project: OpenRepoProject }>("/api/projects/github", {
        method: "POST",
        body: JSON.stringify({ url: githubUrl }),
      });
      setGithubUrl("");
      await refresh();
      setSelectedProjectId(data.project.id);
      setView("project");
      setNotice("Repository project created.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function createDocumentProject(event: FormEvent) {
    event.preventDefault();
    if (!documentFiles || documentFiles.length === 0) {
      setError("Choose at least one document.");
      return;
    }
    setBusy("documents");
    setError(null);
    setNotice(null);
    try {
      const files = await Promise.all(
        Array.from(documentFiles).map(async (file) => ({
          name: file.name,
          contentBase64: await fileToBase64(file),
        })),
      );
      const data = await api<{ project: OpenRepoProject }>("/api/projects/documents", {
        method: "POST",
        body: JSON.stringify({ name: documentName, files }),
      });
      setDocumentFiles(null);
      await refresh();
      setSelectedProjectId(data.project.id);
      setView("project");
      setNotice("Document project created.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function queueAnalysis(projectId: string) {
    setBusy(projectId);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/projects/${projectId}/analysis-jobs`, { method: "POST", body: "{}" });
      await refresh();
      setNotice("Analysis job queued.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function updateThemeMode(themeMode: ThemeMode) {
    setSettings((current) => ({ ...current, themeMode }));
    setSettingsDraft((current) => ({ ...current, themeMode }));
    applyTheme(themeMode);
    try {
      const data = await api<{ settings: OpenRepoSettings }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ ...settings, themeMode }),
      });
      setSettings(data.settings);
      setSettingsDraft(data.settings);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setBusy("settings");
    setError(null);
    setNotice(null);
    try {
      const data = await api<{ settings: OpenRepoSettings }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settingsDraft),
      });
      setSettings(data.settings);
      setSettingsDraft(data.settings);
      applyTheme(data.settings.themeMode);
      setNotice("Settings saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-root text-text-primary noise-overlay">
      <div className="flex min-h-screen">
        <aside className={`${sidebarCollapsed ? "w-[76px]" : "w-[320px]"} flex shrink-0 flex-col border-r border-border-subtle bg-surface/95 transition-all duration-200`}>
          <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-4">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border-medium bg-elevated font-mono text-sm text-text-secondary transition hover:text-text-primary"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? ">" : "<"}
            </button>
            {!sidebarCollapsed && (
              <button type="button" onClick={() => setView("overview")} className="min-w-0 text-left">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">OpenRepoCopilot</p>
                <p className="truncate font-heading text-xl text-text-primary">Workbench</p>
              </button>
            )}
          </div>

          <div className="border-b border-border-subtle p-3">
            <button
              type="button"
              onClick={showCreate}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-sm font-bold text-black transition hover:bg-accent-bright"
              title="创建新项目"
            >
              <span className="font-mono text-base">+</span>
              {!sidebarCollapsed && <span>创建新项目</span>}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {!sidebarCollapsed && (
              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">Projects</p>
                <button
                  type="button"
                  onClick={() => refresh().catch((err: unknown) => setError(errorMessage(err)))}
                  className="rounded border border-border-subtle px-2 py-1 text-[11px] text-text-muted transition hover:text-text-primary"
                >
                  Refresh
                </button>
              </div>
            )}
            <div className="space-y-2">
              {projects.length === 0 ? (
                <div className={`rounded-md border border-dashed border-border-subtle px-3 py-6 text-center text-xs text-text-muted ${sidebarCollapsed ? "hidden" : ""}`}>
                  No projects yet.
                </div>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => showProject(project.id)}
                    className={`w-full rounded-md border px-3 py-3 text-left transition ${
                      selectedProjectId === project.id && view === "project"
                        ? "border-accent/60 bg-accent/10"
                        : "border-border-subtle bg-root/55 hover:border-border-medium"
                    }`}
                    title={project.name}
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border-medium bg-elevated font-mono text-xs text-accent">
                        {project.type === "github_repo" ? "GH" : "KB"}
                      </span>
                      {!sidebarCollapsed && (
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-text-primary">{project.name}</span>
                          <span className="mt-1 flex items-center gap-2">
                            <span className="truncate font-mono text-[10px] text-text-muted">{sourceLabel(project)}</span>
                            {latestJobs[project.id] && (
                              <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${statusClass(latestJobs[project.id]!.status)}`}>
                                {latestJobs[project.id]!.status.replace("_", " ")}
                              </span>
                            )}
                          </span>
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-border-subtle p-3">
            {!sidebarCollapsed ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 rounded-md bg-root p-1">
                  {(["light", "dark", "system"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateThemeMode(mode)}
                      className={`rounded px-2 py-1.5 text-xs font-semibold capitalize transition ${
                        settings.themeMode === mode ? "bg-accent text-black" : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setView("settings")}
                  className="w-full rounded-md border border-border-medium bg-elevated px-3 py-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary"
                >
                  全局设置
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => updateThemeMode(settings.themeMode === "dark" ? "light" : "dark")}
                  className="grid h-10 w-full place-items-center rounded-md border border-border-medium bg-elevated font-mono text-xs text-text-secondary"
                  title="Toggle theme"
                >
                  {settings.themeMode === "light" ? "L" : settings.themeMode === "dark" ? "D" : "S"}
                </button>
                <button
                  type="button"
                  onClick={() => setView("settings")}
                  className="grid h-10 w-full place-items-center rounded-md border border-border-medium bg-elevated font-mono text-xs text-text-secondary"
                  title="Global settings"
                >
                  ...
                </button>
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 lg:px-8">
            {(error || notice) && (
              <div className="mb-5 space-y-2">
                {error && <div className="rounded-md border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">{error}</div>}
                {notice && <div className="rounded-md border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">{notice}</div>}
              </div>
            )}

            {view === "overview" && (
              <OverviewPanel projectCount={projects.length} settings={settings} onCreate={showCreate} />
            )}

            {view === "create" && (
              <CreateProjectPanel
                activeTab={activeTab}
                busy={busy}
                documentFiles={documentFiles}
                documentName={documentName}
                githubUrl={githubUrl}
                onCreateDocument={createDocumentProject}
                onCreateGithub={createGithubProject}
                onDocumentFilesChange={setDocumentFiles}
                onDocumentNameChange={setDocumentName}
                onGithubUrlChange={setGithubUrl}
                onTabChange={setActiveTab}
              />
            )}

            {view === "project" && selectedProject && (
              <ProjectDetailPanel
                busy={busy === selectedProject.id}
                jobs={selectedJobs}
                project={selectedProject}
                onQueue={() => queueAnalysis(selectedProject.id)}
              />
            )}

            {view === "settings" && (
              <SettingsPanel
                busy={busy === "settings"}
                draft={settingsDraft}
                onChange={setSettingsDraft}
                onSubmit={saveSettings}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function OverviewPanel({
  projectCount,
  settings,
  onCreate,
}: {
  projectCount: number;
  settings: OpenRepoSettings;
  onCreate: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center">
      <div className="max-w-3xl">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-accent">OpenRepoCopilot</p>
        <h1 className="font-heading text-4xl leading-tight text-text-primary sm:text-5xl">
          Repository and knowledge graph workbench
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary">
          Create one local project per public repository or document knowledge base, queue analysis, then open the
          generated OpenRepoCopilot graph in the same workspace.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Metric label="Projects" value={String(projectCount)} />
          <Metric label="Theme" value={settings.themeMode} />
          <Metric label="Storage" value="Local" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onCreate}
            className="rounded-md bg-accent px-5 py-3 text-sm font-bold text-black transition hover:bg-accent-bright"
          >
            创建新项目
          </button>
          <span className="rounded-md border border-border-medium bg-elevated px-5 py-3 text-sm font-semibold text-text-secondary">
            Select a project from the sidebar
          </span>
        </div>
      </div>
    </div>
  );
}

function CreateProjectPanel(props: {
  activeTab: ProjectType;
  busy: string | null;
  documentFiles: FileList | null;
  documentName: string;
  githubUrl: string;
  onCreateDocument: (event: FormEvent) => void;
  onCreateGithub: (event: FormEvent) => void;
  onDocumentFilesChange: (files: FileList | null) => void;
  onDocumentNameChange: (name: string) => void;
  onGithubUrlChange: (url: string) => void;
  onTabChange: (tab: ProjectType) => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <div className="w-full max-w-xl rounded-lg border border-border-subtle bg-surface p-5 shadow-2xl shadow-black/20">
        <div className="mb-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">New project</p>
          <h2 className="mt-2 font-heading text-3xl text-text-primary">Choose a source</h2>
        </div>
        <div className="mb-5 grid grid-cols-2 rounded-md bg-elevated p-1">
          <button
            type="button"
            onClick={() => props.onTabChange("github_repo")}
            className={`rounded px-3 py-2 text-sm font-semibold ${props.activeTab === "github_repo" ? "bg-accent/20 text-accent" : "text-text-muted"}`}
          >
            GitHub
          </button>
          <button
            type="button"
            onClick={() => props.onTabChange("document_kb")}
            className={`rounded px-3 py-2 text-sm font-semibold ${props.activeTab === "document_kb" ? "bg-accent/20 text-accent" : "text-text-muted"}`}
          >
            Documents
          </button>
        </div>

        {props.activeTab === "github_repo" ? (
          <form className="space-y-4" onSubmit={props.onCreateGithub}>
            <label className="block text-sm font-semibold text-text-secondary">
              Public GitHub repository
              <input
                value={props.githubUrl}
                onChange={(event) => props.onGithubUrlChange(event.target.value)}
                placeholder="https://github.com/owner/repo"
                className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 font-mono text-sm text-text-primary outline-none transition focus:border-accent"
              />
            </label>
            <button
              type="submit"
              disabled={props.busy !== null || props.githubUrl.trim() === ""}
              className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-bold text-black transition hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {props.busy === "github" ? "Cloning..." : "Create Repository Project"}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={props.onCreateDocument}>
            <label className="block text-sm font-semibold text-text-secondary">
              Project name
              <input
                value={props.documentName}
                onChange={(event) => props.onDocumentNameChange(event.target.value)}
                className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent"
              />
            </label>
            <label className="block text-sm font-semibold text-text-secondary">
              Documents
              <input
                key={props.documentFiles ? Array.from(props.documentFiles).map((file) => file.name).join("|") : "empty"}
                type="file"
                multiple
                accept=".md,.txt,.pdf,.docx"
                onChange={(event) => props.onDocumentFilesChange(event.target.files)}
                className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 text-sm text-text-secondary file:mr-3 file:rounded file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-text-primary"
              />
            </label>
            <button
              type="submit"
              disabled={props.busy !== null}
              className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-bold text-black transition hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {props.busy === "documents" ? "Importing..." : "Create Document Project"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ProjectDetailPanel({
  project,
  jobs,
  busy,
  onQueue,
}: {
  project: OpenRepoProject;
  jobs: OpenRepoJob[];
  busy: boolean;
  onQueue: () => void;
}) {
  const latestJob = jobs[0];
  return (
    <div className="py-4">
      <div className="mb-5 flex flex-col gap-4 border-b border-border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">{project.type === "github_repo" ? "Repository" : "Documents"}</p>
          <h1 className="mt-2 font-heading text-4xl text-text-primary">{project.name}</h1>
          <p className="mt-2 font-mono text-xs text-text-muted">{sourceLabel(project)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onQueue}
            disabled={busy}
            className="rounded-md border border-border-medium bg-elevated px-4 py-2.5 text-sm font-semibold text-text-secondary transition hover:text-text-primary disabled:opacity-50"
          >
            {busy ? "Queuing..." : "Queue Analysis"}
          </button>
          <a
            href={`/?project=${encodeURIComponent(project.id)}`}
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-bold text-black transition hover:bg-accent-bright"
          >
            Open Graph
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Metric label="Latest job" value={latestJob ? latestJob.status.replace("_", " ") : "none"} />
        <Metric label="Source path" value={project.sourcePath} wide />
        <Metric label="Graph path" value={project.graphPath} wide />
      </div>

      <div className="mt-5 rounded-lg border border-border-subtle bg-surface">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="font-heading text-xl">Analysis jobs</h2>
          <span className="font-mono text-xs text-text-muted">{jobs.length} total</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {jobs.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-text-muted">No analysis jobs yet.</div>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusClass(job.status)}`}>
                      {job.status.replace("_", " ")}
                    </span>
                    <span className="font-mono text-xs text-text-muted">{new Date(job.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-2 rounded-md border border-border-subtle bg-root px-3 py-2 font-mono text-xs text-text-secondary">
                    {job.commandHint}
                  </div>
                  {job.error && <p className="mt-2 text-xs text-red-300">{job.error}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  draft,
  busy,
  onChange,
  onSubmit,
}: {
  draft: OpenRepoSettings;
  busy: boolean;
  onChange: (settings: OpenRepoSettings) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-2xl rounded-lg border border-border-subtle bg-surface p-5 shadow-2xl shadow-black/20">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Global settings</p>
        <h2 className="mt-2 font-heading text-3xl text-text-primary">Runtime and agent configuration</h2>
        <div className="mt-6 grid gap-4">
          <SettingsInput
            label="Agent API base URL"
            value={draft.agentApiBaseUrl}
            onChange={(value) => onChange({ ...draft, agentApiBaseUrl: value })}
            placeholder="http://127.0.0.1:5173/api"
          />
          <SettingsInput
            label="Agent API key environment variable"
            value={draft.agentApiKeyEnv}
            onChange={(value) => onChange({ ...draft, agentApiKeyEnv: value })}
            placeholder="OPENREPO_AGENT_API_KEY"
          />
          <SettingsInput
            label="Project clone root path"
            value={draft.cloneRootPath}
            onChange={(value) => onChange({ ...draft, cloneRootPath: value })}
            placeholder="D:\\OpenRepoCopilot\\clones"
          />
          <SettingsInput
            label="Knowledge graph export path"
            value={draft.graphExportPath}
            onChange={(value) => onChange({ ...draft, graphExportPath: value })}
            placeholder="D:\\OpenRepoCopilot\\exports"
          />
          <label className="block text-sm font-semibold text-text-secondary">
            Theme mode
            <select
              value={draft.themeMode}
              onChange={(event) => onChange({ ...draft, themeMode: event.target.value as ThemeMode })}
              className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-bold text-black transition hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block text-sm font-semibold text-text-secondary">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 font-mono text-sm text-text-primary outline-none transition focus:border-accent"
      />
    </label>
  );
}

function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-border-subtle bg-surface p-4 ${wide ? "lg:col-span-1" : ""}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-text-primary" title={value}>{value}</p>
    </div>
  );
}

function sourceLabel(project: OpenRepoProject): string {
  return project.source.type === "github_repo"
    ? project.source.url
    : `${project.source.documentNames.length} document${project.source.documentNames.length === 1 ? "" : "s"}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Request failed.");
  }
  return data as T;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusClass(status: JobStatus): string {
  if (status === "completed") return "bg-emerald-500/15 text-emerald-300";
  if (status === "failed") return "bg-red-500/15 text-red-300";
  if (status === "in_progress") return "bg-sky-500/15 text-sky-300";
  return "bg-amber-500/15 text-amber-300";
}

function applyTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  const resolved = mode === "system"
    ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    : mode;
  document.documentElement.dataset.theme = resolved;
  const vars = resolved === "light"
    ? {
        "--color-root": "#f6f8fa",
        "--color-surface": "#ffffff",
        "--color-elevated": "#eef2f5",
        "--color-panel": "#f2f5f7",
        "--color-accent": "#0f9f5f",
        "--color-accent-dim": "#0b7f4c",
        "--color-accent-bright": "#18c878",
        "--color-text-primary": "#17212b",
        "--color-text-secondary": "#526272",
        "--color-text-muted": "#7b8894",
        "--color-border-subtle": "rgba(23, 33, 43, 0.12)",
        "--color-border-medium": "rgba(15, 159, 95, 0.3)",
        "--glass-bg": "rgba(255, 255, 255, 0.82)",
        "--glass-bg-heavy": "rgba(255, 255, 255, 0.96)",
        "--glass-border": "rgba(15, 159, 95, 0.16)",
        "--glass-border-heavy": "rgba(15, 159, 95, 0.24)",
        "--scrollbar-thumb": "rgba(15, 159, 95, 0.22)",
        "--scrollbar-thumb-hover": "rgba(15, 159, 95, 0.38)",
        "--glow-accent": "rgba(15, 159, 95, 0.14)",
        "--glow-accent-strong": "rgba(15, 159, 95, 0.36)",
        "--glow-accent-pulse": "rgba(15, 159, 95, 0.5)",
        "--color-edge": "rgba(15, 159, 95, 0.34)",
        "--color-edge-dim": "rgba(15, 159, 95, 0.08)",
        "--color-edge-dot": "rgba(15, 159, 95, 0.16)",
        "--color-accent-overlay-bg": "rgba(15, 159, 95, 0.08)",
        "--color-accent-overlay-border": "rgba(15, 159, 95, 0.28)",
        "--kbd-bg": "rgba(15, 159, 95, 0.1)",
      }
    : {
        "--color-root": "#0b0f14",
        "--color-surface": "#111820",
        "--color-elevated": "#17212b",
        "--color-panel": "#141d26",
        "--color-accent": "#39d98a",
        "--color-accent-dim": "#18a863",
        "--color-accent-bright": "#73f3b4",
        "--color-text-primary": "#e6edf3",
        "--color-text-secondary": "#9aa7b4",
        "--color-text-muted": "#6f7d8a",
        "--color-border-subtle": "rgba(116, 139, 158, 0.16)",
        "--color-border-medium": "rgba(57, 217, 138, 0.28)",
        "--glass-bg": "rgba(17, 24, 32, 0.82)",
        "--glass-bg-heavy": "rgba(17, 24, 32, 0.96)",
        "--glass-border": "rgba(57, 217, 138, 0.12)",
        "--glass-border-heavy": "rgba(57, 217, 138, 0.2)",
        "--scrollbar-thumb": "rgba(57, 217, 138, 0.2)",
        "--scrollbar-thumb-hover": "rgba(57, 217, 138, 0.38)",
        "--glow-accent": "rgba(57, 217, 138, 0.16)",
        "--glow-accent-strong": "rgba(57, 217, 138, 0.42)",
        "--glow-accent-pulse": "rgba(57, 217, 138, 0.62)",
        "--color-edge": "rgba(57, 217, 138, 0.34)",
        "--color-edge-dim": "rgba(57, 217, 138, 0.09)",
        "--color-edge-dot": "rgba(57, 217, 138, 0.18)",
        "--color-accent-overlay-bg": "rgba(57, 217, 138, 0.07)",
        "--color-accent-overlay-border": "rgba(57, 217, 138, 0.28)",
        "--kbd-bg": "rgba(57, 217, 138, 0.1)",
      };
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value);
  }
}
