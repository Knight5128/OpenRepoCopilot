import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type ProjectType = "github_repo" | "document_kb";
type JobStatus = "queued" | "in_progress" | "completed" | "failed";
type WorkbenchView = "overview" | "create" | "project" | "settings";
type ThemeMode = "light" | "dark" | "system";
type AgentProvider = "dashscope" | "zhipuai" | "openai" | "deepseek" | "openrouter" | "custom";

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
  queuePosition?: number;
  phase?: string;
  progress?: number;
  logPath?: string;
  commandHint: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

interface GlobalAnalysisJob extends OpenRepoJob {
  projectName: string;
  projectType: ProjectType;
}

interface ProjectDetails {
  project: OpenRepoProject;
  jobs: OpenRepoJob[];
}

interface OpenRepoSettings {
  appearance: {
    themeMode: ThemeMode;
  };
  storage: {
    cloneRootPath: string;
    graphExportPath: string;
  };
  agent: {
    provider: AgentProvider;
    model: string;
    baseUrl: string;
    apiKeyEnv: string;
    autoRunJobs: boolean;
    requestTimeout: number;
    maxConcurrency: number;
  };
}

interface AgentProviderPreset {
  id: AgentProvider;
  label: string;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
}

interface AgentStatus {
  apiKeyConfigured: boolean;
  apiKeyFilePath: string;
  activeApiKeyEnv: string;
}

interface SettingsResponse {
  settings: OpenRepoSettings;
  agentStatus: AgentStatus;
  providerPresets: AgentProviderPreset[];
}

const fallbackSettings: OpenRepoSettings = {
  appearance: {
    themeMode: "system",
  },
  storage: {
    cloneRootPath: "",
    graphExportPath: "",
  },
  agent: {
    provider: "dashscope",
    model: "glm-5.1",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    autoRunJobs: true,
    requestTimeout: 120000,
    maxConcurrency: 2,
  },
};

const fallbackAgentStatus: AgentStatus = {
  apiKeyConfigured: false,
  apiKeyFilePath: "",
  activeApiKeyEnv: "DASHSCOPE_API_KEY",
};

const fallbackProviderPresets: AgentProviderPreset[] = [
  {
    id: "dashscope",
    label: "DashScope / Alibaba Bailian",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "glm-5.1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
  },
];

export default function OpenRepoWorkbench() {
  const [projects, setProjects] = useState<OpenRepoProject[]>([]);
  const [details, setDetails] = useState<Record<string, ProjectDetails>>({});
  const [settings, setSettings] = useState<OpenRepoSettings>(fallbackSettings);
  const [settingsDraft, setSettingsDraft] = useState<OpenRepoSettings>(fallbackSettings);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(fallbackAgentStatus);
  const [providerPresets, setProviderPresets] = useState<AgentProviderPreset[]>(fallbackProviderPresets);
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
  const [noticeVisible, setNoticeVisible] = useState(false);

  const refresh = useCallback(async () => {
    const [projectsData, settingsData] = await Promise.all([
      api<{ projects: OpenRepoProject[] }>("/api/projects"),
      api<SettingsResponse>("/api/settings"),
    ]);
    setProjects(projectsData.projects);
    setSettings(settingsData.settings);
    setSettingsDraft(settingsData.settings);
    setAgentStatus(settingsData.agentStatus);
    setProviderPresets(settingsData.providerPresets);
    const entries = await Promise.all(
      projectsData.projects.map(async (project) => [project.id, await api<ProjectDetails>(`/api/projects/${project.id}`)] as const),
    );
    setDetails(Object.fromEntries(entries));
  }, []);

  async function refreshProjects() {
    setBusy("refresh");
    setError(null);
    setNotice(null);
    try {
      await refresh();
      setNotice("Project list refreshed.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    refresh().catch((err: unknown) => setError(errorMessage(err)));
  }, [refresh]);

  useEffect(() => {
    applyTheme(settings.appearance.themeMode);
  }, [settings.appearance.themeMode]);

  useEffect(() => {
    if (!notice) {
      setNoticeVisible(false);
      return;
    }

    setNoticeVisible(true);
    const fadeTimer = window.setTimeout(() => setNoticeVisible(false), 4000);
    const clearTimer = window.setTimeout(() => setNotice(null), 4300);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [notice]);

  useEffect(() => {
    if (!Object.values(details).some(({ jobs }) => jobs.some((job) => job.status === "queued" || job.status === "in_progress"))) {
      return;
    }
    const timer = window.setInterval(() => {
      refresh().catch((err: unknown) => setError(errorMessage(err)));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [details, refresh]);

  const latestJobs = useMemo(() => {
    const result: Record<string, OpenRepoJob | undefined> = {};
    for (const project of projects) result[project.id] = details[project.id]?.jobs[0];
    return result;
  }, [details, projects]);

  const globalJobs = useMemo<GlobalAnalysisJob[]>(() => {
    return Object.values(details)
      .flatMap(({ project, jobs }) =>
        jobs.map((job) => ({
          ...job,
          projectName: project.name,
          projectType: project.type,
        })),
      )
      .sort(compareGlobalJobs);
  }, [details]);

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
      setTimeout(() => {
      setNotice(null);
    }, 3000);
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
      setTimeout(() => {
      setNotice(null);
    }, 3000);
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
      setNotice("Analysis job added to the global queue.");
      setTimeout(() => {
      setNotice(null);
    }, 3000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAnalysisJob(jobId: string) {
    setBusy(`delete:${jobId}`);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
      await refresh();
      setNotice("Analysis job removed from the global queue.");
      setTimeout(() => {
      setNotice(null);
    }, 3000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteProject(project: OpenRepoProject) {
    const confirmed = window.confirm(
      `Delete "${project.name}" from OpenRepoCopilot?\n\nThis removes its project record, analysis jobs, and generated graph. Source files stored outside the OpenRepoCopilot project directory will be kept.`,
    );
    if (!confirmed) return;

    setBusy(`delete-project:${project.id}`);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      setSelectedProjectId(null);
      setView("overview");
      await refresh();
      setNotice("Project deleted.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function reorderAnalysisJobs(activeJobId: string, targetJobId: string) {
    if (activeJobId === targetJobId) return;
    const activeIndex = globalJobs.findIndex((job) => job.id === activeJobId);
    const targetIndex = globalJobs.findIndex((job) => job.id === targetJobId);
    if (activeIndex < 0 || targetIndex < 0) return;

    const nextJobs = [...globalJobs];
    const [activeJob] = nextJobs.splice(activeIndex, 1);
    nextJobs.splice(targetIndex, 0, activeJob);

    setBusy("queue-order");
    setError(null);
    setNotice(null);
    try {
      await api("/api/jobs/order", {
        method: "PATCH",
        body: JSON.stringify({ jobIds: nextJobs.map((job) => job.id) }),
      });
      await refresh();
      setNotice("Global analysis queue reordered.");
      setTimeout(() => {
      setNotice(null);
    }, 3000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function updateThemeMode(themeMode: ThemeMode) {
    const nextSettings = {
      ...settings,
      appearance: { ...settings.appearance, themeMode },
    };
    setSettings(nextSettings);
    setSettingsDraft((current) => ({ ...current, appearance: { ...current.appearance, themeMode } }));
    applyTheme(themeMode);
    try {
      const data = await api<SettingsResponse>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(nextSettings),
      });
      setSettings(data.settings);
      setSettingsDraft(data.settings);
      setAgentStatus(data.agentStatus);
      setProviderPresets(data.providerPresets);
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
      const data = await api<SettingsResponse>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settingsDraft),
      });
      setSettings(data.settings);
      setSettingsDraft(data.settings);
      setAgentStatus(data.agentStatus);
      setProviderPresets(data.providerPresets);
      applyTheme(data.settings.appearance.themeMode);
      setNotice("Settings saved.");
      setTimeout(() => {
      setNotice(null);
    }, 3000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function testAgentConnection() {
    setBusy("agent-test");
    setError(null);
    setNotice(null);
    try {
      await api("/api/agent/test", {
        method: "POST",
        body: JSON.stringify({ agent: settingsDraft.agent }),
      });
      setNotice("Agent connection test passed.");
      setTimeout(() => {
      setNotice(null);
    }, 4000);
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
          <div className={`flex items-center border-b border-border-subtle py-4 ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4"}`}>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border-medium bg-elevated font-mono text-sm text-text-secondary transition hover:text-text-primary"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronIcon direction={sidebarCollapsed ? "right" : "left"} />
            </button>
            {!sidebarCollapsed && (
              <button type="button" onClick={() => setView("overview")} className="min-w-0 text-left">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">OpenRepoCopilot</p>
                <p className="truncate font-heading text-xl text-text-primary">Workbench</p>
              </button>
            )}
          </div>

          <div className={`border-b border-border-subtle p-3 ${sidebarCollapsed ? "flex justify-center" : ""}`}>
            <button
              type="button"
              onClick={showCreate}
              className={`flex items-center justify-center rounded-md bg-accent text-sm font-bold text-black transition hover:bg-accent-bright ${
                sidebarCollapsed ? "h-10 w-10 p-0" : "w-full gap-2 px-3 py-2.5"
              }`}
              aria-label="Create new project"
              title="创建新项目"
            >
              <PlusIcon />
              {!sidebarCollapsed && <span>创建新项目</span>}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {!sidebarCollapsed && (
              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">Projects</p>
                <button
                  type="button"
                  onClick={refreshProjects}
                  disabled={busy === "refresh"}
                  className="rounded border border-border-subtle px-2 py-1 text-[11px] text-text-muted transition hover:text-text-primary disabled:cursor-wait disabled:opacity-60"
                >
                  {busy === "refresh" ? "Refreshing..." : "Refresh"}
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
                    className={`rounded-md border text-left transition ${
                      sidebarCollapsed ? "mx-auto block h-10 w-10 p-0" : "w-full px-3 py-3"
                    } ${
                      selectedProjectId === project.id && view === "project"
                        ? "border-accent/60 bg-accent/10"
                        : "border-border-subtle bg-root/55 hover:border-border-medium"
                    }`}
                    title={project.name}
                  >
                    <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
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

          <div className={`border-t border-border-subtle p-3 ${sidebarCollapsed ? "flex justify-center" : ""}`}>
            {!sidebarCollapsed ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 rounded-md bg-root p-1">
                  {(["light", "dark", "system"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateThemeMode(mode)}
                      className={`grid h-9 place-items-center rounded transition ${
                        settings.appearance.themeMode === mode ? "bg-accent text-black" : "text-text-muted hover:text-text-primary"
                      }`}
                      title={`${themeModeLabel(mode)} theme`}
                      aria-label={`Use ${themeModeLabel(mode)} theme`}
                    >
                      <ThemeIcon mode={mode} />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setView((current) => current === "settings" ? "overview" : "settings")}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-border-medium bg-elevated px-3 py-2 text-sm font-semibold text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
                >
                  <SettingsIcon />
                  {view === "settings" ? "返回工作台" : "全局设置"}
                </button>
              </div>
            ) : (
              <div className="flex w-10 flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateThemeMode(nextThemeMode(settings.appearance.themeMode))}
                  className="grid h-10 w-10 place-items-center rounded-md border border-border-medium bg-elevated text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
                  title={`Theme: ${themeModeLabel(settings.appearance.themeMode)}. Click to switch.`}
                  aria-label={`Current theme is ${themeModeLabel(settings.appearance.themeMode)}. Switch theme.`}
                >
                  <ThemeIcon mode={settings.appearance.themeMode} />
                </button>
                <button
                  type="button"
                  onClick={() => setView((current) => current === "settings" ? "overview" : "settings")}
                  className="grid h-10 w-10 place-items-center rounded-md border border-border-medium bg-elevated text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
                  title={view === "settings" ? "Back to workbench" : "Global settings"}
                  aria-label={view === "settings" ? "Back to workbench" : "Global settings"}
                >
                  <SettingsIcon />
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
                {notice && (
                  <div
                    className={`rounded-md border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100 transition-opacity duration-300 ${
                      noticeVisible ? "opacity-100" : "opacity-0"
                    }`}
                    role="status"
                  >
                    {notice}
                  </div>
                )}
              </div>
            )}

            {view === "overview" && (
              <OverviewPanel
                projectCount={projects.length}
                settings={settings}
                onCreate={showCreate}
                onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
              />
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
                busyAction={busy}
                globalJobs={globalJobs}
                jobs={selectedJobs}
                project={selectedProject}
                onDeleteProject={() => deleteProject(selectedProject)}
                onDeleteJob={deleteAnalysisJob}
                onQueue={() => queueAnalysis(selectedProject.id)}
                onReorderJobs={reorderAnalysisJobs}
              />
            )}

            {view === "settings" && (
              <SettingsPanel
                agentStatus={agentStatus}
                busy={busy === "settings"}
                providerPresets={providerPresets}
                draft={settingsDraft}
                testing={busy === "agent-test"}
                onBack={() => setView("overview")}
                onChange={setSettingsDraft}
                onTestAgent={testAgentConnection}
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
  onToggleSidebar,
}: {
  projectCount: number;
  settings: OpenRepoSettings;
  onCreate: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center py-8">
      <div className="w-full">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-accent">OpenRepoCopilot</p>
        <h1 className="font-heading text-4xl font-semibold leading-[1.12] text-text-primary sm:text-5xl xl:whitespace-nowrap">
          Repository and knowledge graph workbench
        </h1>

        <div className="mt-7 grid items-center gap-10 2xl:grid-cols-[minmax(720px,1.08fr)_minmax(430px,0.82fr)]">
          <div className="max-w-4xl">
          <p className="mt-5 font-heading text-2xl font-semibold leading-snug text-accent sm:text-3xl">
            让任何陌生代码库，一看就懂
          </p>
          <p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary">
            从代码结构、模块关系到关键概念，在本地完成仓库分析并生成可探索的知识图谱，
            帮助你更快理解、检索和协作。
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <OverviewStatusCard
              accent="emerald"
              badge={projectCount > 0 ? "Ready" : "Waiting"}
              description={projectCount > 0 ? "本地项目已就绪，可开始知识图谱探索" : "创建本地项目后即可开始分析"}
              icon="projects"
              title="项目总览"
              value={`${projectCount} 个仓库`}
            />
            <OverviewStatusCard
              accent="blue"
              badge={themeModeLabel(settings.appearance.themeMode)}
              description={themeModeDescription(settings.appearance.themeMode)}
              icon="theme"
              themeMode={settings.appearance.themeMode}
              title="当前主题"
              value={themeModeDisplayValue(settings.appearance.themeMode)}
            />
            <OverviewStatusCard
              accent="cyan"
              badge="Local"
              description="代码解析与图谱数据保存在本地环境"
              icon="storage"
              title="数据存储"
              value="本地优先"
            />
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onCreate}
              className="flex items-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-bold text-black transition hover:bg-accent-bright"
            >
              <PlusIcon />
              创建新项目
            </button>
            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex items-center gap-2 rounded-md border border-border-medium bg-elevated px-5 py-3 text-sm font-semibold text-text-secondary transition hover:border-accent hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              aria-label="切换侧边栏"
            >
              <ChevronIcon direction="right" />
              从左侧选择项目开始探索
            </button>
          </div>
          </div>
          <KnowledgeGraphIllustration />
        </div>
      </div>
    </div>
  );
}

function OverviewStatusCard({
  accent,
  badge,
  description,
  icon,
  themeMode,
  title,
  value,
}: {
  accent: "emerald" | "blue" | "cyan";
  badge: string;
  description: string;
  icon: "projects" | "theme" | "storage";
  themeMode?: ThemeMode;
  title: string;
  value: string;
}) {
  const styles = {
    emerald: {
      border: "border-emerald-500/20",
      icon: "bg-emerald-500/10 text-emerald-500",
      badge: "bg-emerald-500/10 text-emerald-500",
    },
    blue: {
      border: "border-blue-500/20",
      icon: "bg-blue-500/10 text-blue-500",
      badge: "bg-blue-500/10 text-blue-500",
    },
    cyan: {
      border: "border-cyan-500/20",
      icon: "bg-cyan-500/10 text-cyan-500",
      badge: "bg-cyan-500/10 text-cyan-500",
    },
  }[accent];

  return (
    <div className={`flex min-h-52 flex-col rounded-2xl border bg-surface/80 p-5 shadow-lg shadow-black/[0.03] backdrop-blur-sm ${styles.border}`}>
      <div className="flex items-center gap-4">
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl ${styles.icon}`}>
          <OverviewCardIcon type={icon} themeMode={themeMode} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-muted">{title}</p>
          <p className="mt-1 font-heading text-xl font-semibold leading-snug text-text-primary">{value}</p>
        </div>
      </div>
      <p className="mt-5 min-h-12 text-sm leading-6 text-text-secondary">{description}</p>
      <div className="mt-auto pt-4">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${styles.badge}`}>
          {icon === "projects" && projectStatusIcon(badge)}
          {icon === "theme" && <ThemeIcon mode={badge.toLowerCase() as ThemeMode} />}
          {icon === "storage" && <ShieldIcon />}
          {badge}
        </span>
      </div>
    </div>
  );
}

function OverviewCardIcon({ type, themeMode }: { type: "projects" | "theme" | "storage"; themeMode?: ThemeMode }) {
  if (type === "projects") {
    return (
      <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 24 24">
        <ellipse cx="12" cy="5" rx="6.5" ry="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 5v5c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5V5M5.5 10v5c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5v-5M5.5 15v4c0 1.38 2.91 2.5 6.5 2.5s6.5-1.12 6.5-2.5v-4" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (type === "theme") {
    return <span className="[&>svg]:h-7 [&>svg]:w-7"><ThemeIcon mode={themeMode ?? "system"} /></span>;
  }

  return (
    <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function projectStatusIcon(status: string) {
  return status === "Ready" ? (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  ) : (
    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current opacity-70" />
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M12 3 5.5 5.5v5.2c0 4.1 2.7 7.9 6.5 9.3 3.8-1.4 6.5-5.2 6.5-9.3V5.5L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m9 11.5 2 2 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function KnowledgeGraphIllustration() {
  return (
    <div className="relative hidden xl:block" aria-hidden="true">
      <div className="absolute inset-[12%] rounded-full bg-accent/10 blur-3xl" />
      <svg
        className="relative mx-auto w-full max-w-[570px] text-text-secondary opacity-90"
        fill="none"
        viewBox="0 0 580 500"
      >
        <defs>
          <linearGradient id="overview-card" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="var(--color-surface)" stopOpacity="0.96" />
            <stop offset="1" stopColor="var(--color-elevated)" stopOpacity="0.72" />
          </linearGradient>
          <linearGradient id="overview-accent" x1="0" x2="1">
            <stop stopColor="var(--color-accent)" stopOpacity="0.92" />
            <stop offset="1" stopColor="var(--color-accent-bright)" stopOpacity="0.7" />
          </linearGradient>
          <filter id="overview-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="10" floodColor="var(--color-root)" floodOpacity="0.35" stdDeviation="12" />
          </filter>
        </defs>

        <path d="M164 180 246 224M326 222l78-116M330 238l105 9M315 267l89 112M247 275l-74 103" stroke="var(--color-border-medium)" strokeDasharray="6 7" strokeWidth="2" />

        <g filter="url(#overview-shadow)">
          <rect x="18" y="88" width="170" height="184" rx="16" fill="url(#overview-card)" stroke="var(--color-border-subtle)" />
          <circle cx="42" cy="112" r="5" fill="#f38b72" />
          <circle cx="60" cy="112" r="5" fill="#edc467" />
          <circle cx="78" cy="112" r="5" fill="var(--color-accent)" opacity="0.7" />
          <path d="M42 140h75M42 156h108M42 172h54M58 188h80M58 204h62M42 220h98M58 236h48" stroke="currentColor" strokeLinecap="round" strokeOpacity="0.28" strokeWidth="5" />
          <path d="M42 140h34M58 188h28M42 220h42" stroke="var(--color-accent)" strokeLinecap="round" strokeOpacity="0.75" strokeWidth="5" />
          <text x="103" y="298" fill="currentColor" fontFamily="var(--font-sans)" fontSize="14" fontWeight="600" textAnchor="middle">代码仓库</text>
        </g>

        <g stroke="var(--color-border-medium)" strokeWidth="2">
          <path d="M226 190 280 146 343 177 374 238 335 304 260 311 215 253Z" />
          <path d="M280 146 300 226 343 177M226 190l74 36-85 27M300 226l74 12M300 226l35 78M300 226l-40 85" />
          <path d="M260 311 215 253M335 304l39-66" />
        </g>
        <g fill="var(--color-elevated)" stroke="var(--color-accent)" strokeWidth="2">
          <circle cx="280" cy="146" r="13" />
          <circle cx="343" cy="177" r="16" />
          <circle cx="374" cy="238" r="13" />
          <circle cx="335" cy="304" r="15" />
          <circle cx="260" cy="311" r="12" />
          <circle cx="215" cy="253" r="14" />
          <circle cx="226" cy="190" r="11" />
        </g>
        <circle cx="300" cy="226" r="34" fill="url(#overview-accent)" stroke="var(--color-accent-bright)" strokeWidth="2" />
        <text x="300" y="234" fill="var(--color-root)" fontFamily="var(--font-mono)" fontSize="22" fontWeight="700" textAnchor="middle">&lt;/&gt;</text>
        <text x="300" y="355" fill="currentColor" fontFamily="var(--font-sans)" fontSize="14" fontWeight="600" textAnchor="middle">知识图谱</text>

        {[
          { y: 54, color: "#6fcf97", title: "模块", subtitle: "Module" },
          { y: 132, color: "#62a8ea", title: "类 / 接口", subtitle: "Class / Interface" },
          { y: 210, color: "#9b8be8", title: "函数 / 方法", subtitle: "Function / Method" },
          { y: 288, color: "#e8b65c", title: "依赖关系", subtitle: "Dependency" },
          { y: 366, color: "#62bdac", title: "关键概念", subtitle: "Concept" },
        ].map((item) => (
          <g key={item.title} filter="url(#overview-shadow)">
            <rect x="404" y={item.y} width="158" height="58" rx="12" fill="url(#overview-card)" stroke={item.color} strokeOpacity="0.65" />
            <circle cx="426" cy={item.y + 29} r="9" fill={item.color} fillOpacity="0.22" stroke={item.color} />
            <text x="445" y={item.y + 25} fill="currentColor" fontFamily="var(--font-sans)" fontSize="13" fontWeight="600">{item.title}</text>
            <text x="445" y={item.y + 42} fill="currentColor" fillOpacity="0.55" fontFamily="var(--font-mono)" fontSize="9">{item.subtitle}</text>
          </g>
        ))}

        <path d="M300 370v36M300 406H138v28M300 406h162v28M300 406v28" stroke="var(--color-border-medium)" strokeDasharray="5 6" strokeWidth="2" />
        {[
          { x: 70, label: "智能问答" },
          { x: 231, label: "洞察分析" },
          { x: 392, label: "团队协作" },
        ].map((item) => (
          <g key={item.label}>
            <rect x={item.x} y="434" width="138" height="48" rx="12" fill="url(#overview-card)" stroke="var(--color-border-subtle)" />
            <circle cx={item.x + 24} cy="458" r="9" fill="var(--color-accent)" fillOpacity="0.18" stroke="var(--color-accent)" />
            <text x={item.x + 43} y="463" fill="currentColor" fontFamily="var(--font-sans)" fontSize="13" fontWeight="600">{item.label}</text>
          </g>
        ))}
      </svg>
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
  globalJobs,
  busy,
  busyAction,
  onQueue,
  onDeleteProject,
  onDeleteJob,
  onReorderJobs,
}: {
  project: OpenRepoProject;
  jobs: OpenRepoJob[];
  globalJobs: GlobalAnalysisJob[];
  busy: boolean;
  busyAction: string | null;
  onQueue: () => void;
  onDeleteProject: () => void;
  onDeleteJob: (jobId: string) => void;
  onReorderJobs: (activeJobId: string, targetJobId: string) => void;
}) {
  const latestJob = jobs[0];
  const status = analysisStatus(latestJob);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverJobId, setDragOverJobId] = useState<string | null>(null);
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
            onClick={onDeleteProject}
            disabled={busyAction === `delete-project:${project.id}`}
            className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:border-red-500/60 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50"
          >
            {busyAction === `delete-project:${project.id}` ? "Deleting..." : "Delete Project"}
          </button>
          <button
            type="button"
            onClick={onQueue}
            disabled={busy}
            className="rounded-md border border-border-medium bg-elevated px-4 py-2.5 text-sm font-semibold text-text-secondary transition hover:text-text-primary disabled:opacity-50"
          >
            {busy ? "Starting..." : "Begin Analysis"}
          </button>
          {latestJob?.status === "completed" ? (
            <a
              href={`/?project=${encodeURIComponent(project.id)}`}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-bold text-black transition hover:bg-accent-bright"
            >
              Open Graph
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-md bg-accent/30 px-4 py-2.5 text-sm font-bold text-text-muted"
              title="Complete an analysis before opening the knowledge graph."
            >
              Graph Not Ready
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Metric label="Latest job" value={latestJob ? latestJob.status.replace("_", " ") : "none"} />
        <Metric label="Worker phase" value={latestJob?.phase ?? "idle"} />
        <Metric label="Source path" value={project.sourcePath} wide />
        <Metric label="Graph path" value={project.graphPath} wide />
      </div>

      <section className="mt-5 rounded-lg border border-border-subtle bg-surface">
        <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">Analysis Status</p>
            <h2 className="mt-1 font-heading text-xl text-text-primary">{status.title}</h2>
          </div>
          <span className={`w-fit rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${status.badgeClass}`}>
            {status.badge}
          </span>
        </div>
        <div className="px-4 py-4">
          <div className="h-2 overflow-hidden rounded-full bg-root">
            <div
              className={`h-full rounded-full transition-all duration-500 ${status.barClass}`}
              style={{ width: `${status.progress}%` }}
            />
          </div>
          <div className="mt-3 grid gap-3 text-xs text-text-secondary sm:grid-cols-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Progress</p>
              <p className="mt-1 font-semibold text-text-primary">{status.progress}%</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Last update</p>
              <p className="mt-1 font-semibold text-text-primary">
                {latestJob ? new Date(latestJob.updatedAt).toLocaleString() : "Not started"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Current job</p>
              <p className="mt-1 truncate font-mono text-text-primary" title={latestJob?.id ?? "none"}>
                {latestJob?.id ?? "none"}
              </p>
            </div>
          </div>
          {latestJob?.logPath && (
            <div className="mt-3 rounded-md border border-border-subtle bg-root px-3 py-2 font-mono text-xs text-text-muted">
              Log: {latestJob.logPath}
            </div>
          )}
          {latestJob?.error && <p className="mt-3 text-xs text-red-300">{latestJob.error}</p>}
        </div>
      </section>

      <div className="mt-5 rounded-lg border border-border-subtle bg-surface">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="font-heading text-xl">Global Analysis Queue</h2>
          <span className="font-mono text-xs text-text-muted">{globalJobs.length} total</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {globalJobs.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-text-muted">No analysis jobs queued yet.</div>
          ) : (
            globalJobs.map((job) => (
              <div
                key={job.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", job.id);
                  setDraggedJobId(job.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverJobId(job.id);
                }}
                onDragLeave={() => setDragOverJobId((current) => current === job.id ? null : current)}
                onDrop={(event) => {
                  event.preventDefault();
                  const activeJobId = draggedJobId ?? event.dataTransfer.getData("text/plain");
                  if (activeJobId) onReorderJobs(activeJobId, job.id);
                  setDraggedJobId(null);
                  setDragOverJobId(null);
                }}
                onDragEnd={() => {
                  setDraggedJobId(null);
                  setDragOverJobId(null);
                }}
                className={`grid gap-3 px-4 py-4 transition lg:grid-cols-[1fr_auto] lg:items-center ${
                  dragOverJobId === job.id ? "bg-accent/10" : "bg-transparent"
                } ${draggedJobId === job.id ? "opacity-60" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="grid h-7 w-7 cursor-grab place-items-center rounded border border-border-subtle bg-root font-mono text-xs text-text-muted active:cursor-grabbing"
                      title="Drag to reorder"
                    >
                      ::
                    </span>
                    <span className="rounded border border-border-subtle bg-root px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {job.projectType === "github_repo" ? "GH" : "KB"}
                    </span>
                    <span className="max-w-[280px] truncate text-sm font-semibold text-text-primary" title={job.projectName}>
                      {job.projectName}
                    </span>
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
                <button
                  type="button"
                  onClick={() => onDeleteJob(job.id)}
                  disabled={busyAction === `delete:${job.id}`}
                  className="h-9 w-9 rounded-md border border-border-subtle bg-root font-mono text-sm text-text-muted transition hover:border-red-500/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Delete analysis job"
                  aria-label={`Delete analysis job ${job.id}`}
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function compareGlobalJobs(a: GlobalAnalysisJob, b: GlobalAnalysisJob): number {
  const parsedA = a.queuePosition ?? Date.parse(a.createdAt);
  const parsedB = b.queuePosition ?? Date.parse(b.createdAt);
  const aPosition = Number.isFinite(parsedA) ? parsedA : 0;
  const bPosition = Number.isFinite(parsedB) ? parsedB : 0;
  if (aPosition !== bPosition) return aPosition - bPosition;
  return a.createdAt.localeCompare(b.createdAt);
}

function analysisStatus(job: OpenRepoJob | undefined): {
  title: string;
  badge: string;
  progress: number;
  badgeClass: string;
  barClass: string;
} {
  if (!job) {
    return {
      title: "Ready to begin",
      badge: "idle",
      progress: 0,
      badgeClass: "bg-elevated text-text-muted",
      barClass: "bg-border-medium",
    };
  }
  if (job.status === "queued") {
    return {
      title: job.phase ? `Waiting: ${job.phase}` : "Waiting in the global queue",
      badge: "queued",
      progress: job.progress ?? 15,
      badgeClass: statusClass(job.status),
      barClass: "bg-amber-400",
    };
  }
  if (job.status === "in_progress") {
    return {
      title: job.phase ? `Running: ${job.phase}` : "Analysis is running",
      badge: "in progress",
      progress: job.progress ?? 55,
      badgeClass: statusClass(job.status),
      barClass: "bg-sky-400",
    };
  }
  if (job.status === "completed") {
    return {
      title: "Analysis completed",
      badge: "completed",
      progress: 100,
      badgeClass: statusClass(job.status),
      barClass: "bg-emerald-400",
    };
  }
  return {
    title: "Analysis failed",
    badge: "failed",
    progress: 100,
    badgeClass: statusClass(job.status),
    barClass: "bg-red-400",
  };
}

function SettingsPanel({
  draft,
  agentStatus,
  busy,
  providerPresets,
  testing,
  onBack,
  onChange,
  onTestAgent,
  onSubmit,
}: {
  draft: OpenRepoSettings;
  agentStatus: AgentStatus;
  busy: boolean;
  providerPresets: AgentProviderPreset[];
  testing: boolean;
  onBack: () => void;
  onChange: (settings: OpenRepoSettings) => void;
  onTestAgent: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const activePreset = providerPresets.find((preset) => preset.id === draft.agent.provider) ?? providerPresets[0];

  function applyProviderPreset(provider: AgentProvider) {
    const preset = providerPresets.find((candidate) => candidate.id === provider);
    onChange({
      ...draft,
      agent: {
        ...draft.agent,
        provider,
        baseUrl: preset?.baseUrl ?? draft.agent.baseUrl,
        model: preset?.model ?? draft.agent.model,
        apiKeyEnv: preset?.apiKeyEnv ?? draft.agent.apiKeyEnv,
      },
    });
  }

  function restoreActivePreset() {
    if (!activePreset) return;
    onChange({
      ...draft,
      agent: {
        ...draft.agent,
        provider: activePreset.id,
        baseUrl: activePreset.baseUrl,
        model: activePreset.model,
        apiKeyEnv: activePreset.apiKeyEnv,
      },
    });
  }

  return (
    <div className="py-4">
      <form onSubmit={onSubmit} className="w-full rounded-lg border border-border-subtle bg-surface p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Global settings</p>
            <h2 className="mt-2 font-heading text-3xl text-text-primary">Runtime configuration</h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center gap-2 rounded-md border border-border-medium bg-elevated px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
          >
            <ChevronIcon direction="left" />
            返回工作台
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <section className="rounded-md border border-border-subtle bg-root/45 p-4">
            <h3 className="font-heading text-xl text-text-primary">Appearance</h3>
            <label className="mt-4 block text-sm font-semibold text-text-secondary">
              Theme mode
              <select
                value={draft.appearance.themeMode}
                onChange={(event) => onChange({ ...draft, appearance: { ...draft.appearance, themeMode: event.target.value as ThemeMode } })}
                className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </label>
          </section>

          <section className="rounded-md border border-border-subtle bg-root/45 p-4">
            <h3 className="font-heading text-xl text-text-primary">Project storage</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SettingsInput
                label="Project clone root path"
                value={draft.storage.cloneRootPath}
                onChange={(value) => onChange({ ...draft, storage: { ...draft.storage, cloneRootPath: value } })}
                placeholder="D:\\OpenRepoCopilot\\clones"
              />
              <SettingsInput
                label="Knowledge graph export path"
                value={draft.storage.graphExportPath}
                onChange={(value) => onChange({ ...draft, storage: { ...draft.storage, graphExportPath: value } })}
                placeholder="D:\\OpenRepoCopilot\\exports"
              />
            </div>
          </section>

          <section className="rounded-md border border-border-subtle bg-root/45 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-heading text-xl text-text-primary">Agent / model provider</h3>
                <p className="mt-1 text-xs text-text-muted">
                  API keys are read from environment variables or the local agent.env file only.
                </p>
              </div>
              <span className={`w-fit rounded px-2 py-1 font-mono text-[10px] uppercase ${agentStatus.apiKeyConfigured ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                {agentStatus.apiKeyConfigured ? "key configured" : "key missing"}
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-text-secondary">
                API provider
                <select
                  value={draft.agent.provider}
                  onChange={(event) => applyProviderPreset(event.target.value as AgentProvider)}
                  className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent"
                >
                  {providerPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                </select>
              </label>
              <SettingsInput
                label="Model"
                value={draft.agent.model}
                onChange={(value) => onChange({ ...draft, agent: { ...draft.agent, model: value } })}
                placeholder="glm-5.1"
              />
              <SettingsInput
                label="Base URL"
                value={draft.agent.baseUrl}
                onChange={(value) => onChange({ ...draft, agent: { ...draft.agent, baseUrl: value } })}
                placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
              />
              <SettingsInput
                label="API key environment variable"
                value={draft.agent.apiKeyEnv}
                onChange={(value) => onChange({ ...draft, agent: { ...draft.agent, apiKeyEnv: value } })}
                placeholder="DASHSCOPE_API_KEY"
              />
            </div>

            <div className="mt-4 rounded-md border border-border-subtle bg-surface px-3 py-2 font-mono text-xs text-text-muted">
              Key file: {agentStatus.apiKeyFilePath || "<OPENREPO_HOME>\\agent.env"}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={restoreActivePreset}
                className="rounded-md border border-border-medium bg-elevated px-4 py-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary"
              >
                Restore provider preset
              </button>
              <button
                type="button"
                onClick={onTestAgent}
                disabled={testing}
                className="rounded-md border border-border-medium bg-elevated px-4 py-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testing ? "Testing..." : "Test connection"}
              </button>
            </div>
          </section>

          <section className="rounded-md border border-border-subtle bg-root/45 p-4">
            <h3 className="font-heading text-xl text-text-primary">Analysis runtime</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm font-semibold text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.agent.autoRunJobs}
                  onChange={(event) => onChange({ ...draft, agent: { ...draft.agent, autoRunJobs: event.target.checked } })}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                Auto-run queued jobs
              </label>
              <SettingsInput
                label="Request timeout (ms)"
                type="number"
                value={String(draft.agent.requestTimeout)}
                onChange={(value) => onChange({ ...draft, agent: { ...draft.agent, requestTimeout: Number(value) } })}
                placeholder="120000"
              />
              <SettingsInput
                label="Max concurrency"
                type="number"
                value={String(draft.agent.maxConcurrency)}
                onChange={(value) => onChange({ ...draft, agent: { ...draft.agent, maxConcurrency: Number(value) } })}
                placeholder="2"
              />
            </div>
          </section>
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
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: "text" | "number";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block text-sm font-semibold text-text-secondary">
      {label}
      <input
        type={type}
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

function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === "light") return "dark";
  if (mode === "dark") return "system";
  return "light";
}

function themeModeLabel(mode: ThemeMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function themeModeChineseLabel(mode: ThemeMode): string {
  if (mode === "light") return "亮色";
  if (mode === "dark") return "暗色";
  return "跟随系统";
}

function themeModeDisplayValue(mode: ThemeMode): string {
  return mode === "system" ? "跟随系统" : `${themeModeChineseLabel(mode)}模式`;
}

function themeModeDescription(mode: ThemeMode): string {
  if (mode === "light") return "清爽明亮，适合展示与阅读代码关系";
  if (mode === "dark") return "降低高亮对比，适合低光环境持续阅读";
  return "自动匹配系统外观，在亮色与暗色间切换";
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3v-4h.04A1.7 1.7 0 0 0 4.6 8.92a1.7 1.7 0 0 0-.34-1.87L4.2 7l2.83-2.83.06.06a1.7 1.7 0 0 0 1.87.34A1.7 1.7 0 0 0 10 3.04V3h4v.04a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06L19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.87A1.7 1.7 0 0 0 20.96 10H21v4h-.04A1.7 1.7 0 0 0 19.4 15Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (mode === "dark") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
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
