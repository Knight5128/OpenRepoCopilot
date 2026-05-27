import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type ProjectType = "github_repo" | "document_kb";
type JobStatus = "queued" | "in_progress" | "completed" | "failed";

interface OpenRepoProject {
  id: string;
  name: string;
  type: ProjectType;
  updatedAt: string;
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
}

interface ProjectDetails {
  project: OpenRepoProject;
  jobs: OpenRepoJob[];
}

export default function OpenRepoWorkbench() {
  const [projects, setProjects] = useState<OpenRepoProject[]>([]);
  const [details, setDetails] = useState<Record<string, ProjectDetails>>({});
  const [githubUrl, setGithubUrl] = useState("");
  const [documentName, setDocumentName] = useState("Document Knowledge Base");
  const [documentFiles, setDocumentFiles] = useState<FileList | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectType>("github_repo");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await api<{ projects: OpenRepoProject[] }>("/api/projects");
    setProjects(data.projects);
    const entries = await Promise.all(
      data.projects.map(async (project) => [project.id, await api<ProjectDetails>(`/api/projects/${project.id}`)] as const),
    );
    setDetails(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) => setError(errorMessage(err)));
  }, [refresh]);

  const latestJobs = useMemo(() => {
    const result: Record<string, OpenRepoJob | undefined> = {};
    for (const project of projects) result[project.id] = details[project.id]?.jobs[0];
    return result;
  }, [details, projects]);

  async function createGithubProject(event: FormEvent) {
    event.preventDefault();
    setBusy("github");
    setError(null);
    try {
      await api("/api/projects/github", { method: "POST", body: JSON.stringify({ url: githubUrl }) });
      setGithubUrl("");
      await refresh();
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
    try {
      const files = await Promise.all(
        Array.from(documentFiles).map(async (file) => ({
          name: file.name,
          contentBase64: await fileToBase64(file),
        })),
      );
      await api("/api/projects/documents", {
        method: "POST",
        body: JSON.stringify({ name: documentName, files }),
      });
      setDocumentFiles(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function queueAnalysis(projectId: string) {
    setBusy(projectId);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/analysis-jobs`, { method: "POST", body: "{}" });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-root text-text-primary noise-overlay">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">OpenRepoCopilot</p>
            <h1 className="font-heading text-3xl text-text-primary sm:text-4xl">Repository and knowledge graph workbench</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              Create one local project per public repository or document knowledge base, queue analysis, then open the
              generated Understand-Anything graph in the same workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh().catch((err: unknown) => setError(errorMessage(err)))}
            className="h-10 rounded-md border border-border-medium bg-elevated px-4 text-sm font-semibold text-text-secondary transition hover:text-text-primary"
          >
            Refresh
          </button>
        </header>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="mb-4 grid grid-cols-2 rounded-md bg-elevated p-1">
              <button
                type="button"
                onClick={() => setActiveTab("github_repo")}
                className={`rounded px-3 py-2 text-sm font-semibold ${activeTab === "github_repo" ? "bg-accent/20 text-accent" : "text-text-muted"}`}
              >
                GitHub
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("document_kb")}
                className={`rounded px-3 py-2 text-sm font-semibold ${activeTab === "document_kb" ? "bg-accent/20 text-accent" : "text-text-muted"}`}
              >
                Documents
              </button>
            </div>

            {activeTab === "github_repo" ? (
              <form className="space-y-4" onSubmit={createGithubProject}>
                <label className="block text-sm font-semibold text-text-secondary">
                  Public GitHub repository
                  <input
                    value={githubUrl}
                    onChange={(event) => setGithubUrl(event.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 font-mono text-sm text-text-primary outline-none transition focus:border-accent"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy !== null || githubUrl.trim() === ""}
                  className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-bold text-black transition hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "github" ? "Cloning..." : "Create Repository Project"}
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={createDocumentProject}>
                <label className="block text-sm font-semibold text-text-secondary">
                  Project name
                  <input
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent"
                  />
                </label>
                <label className="block text-sm font-semibold text-text-secondary">
                  Documents
                  <input
                    key={documentFiles ? Array.from(documentFiles).map((file) => file.name).join("|") : "empty"}
                    type="file"
                    multiple
                    accept=".md,.txt,.pdf,.docx"
                    onChange={(event) => setDocumentFiles(event.target.files)}
                    className="mt-2 w-full rounded-md border border-border-medium bg-root px-3 py-2 text-sm text-text-secondary file:mr-3 file:rounded file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-text-primary"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy !== null}
                  className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-bold text-black transition hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "documents" ? "Importing..." : "Create Document Project"}
                </button>
              </form>
            )}
          </div>

          <div className="min-h-[520px] rounded-lg border border-border-subtle bg-surface">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <h2 className="font-heading text-xl">Projects</h2>
              <span className="font-mono text-xs text-text-muted">{projects.length} total</span>
            </div>
            <div className="divide-y divide-border-subtle">
              {projects.length === 0 ? (
                <div className="px-4 py-14 text-center text-sm text-text-muted">No projects yet.</div>
              ) : (
                projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    latestJob={latestJobs[project.id]}
                    busy={busy === project.id}
                    onQueue={() => queueAnalysis(project.id)}
                  />
                ))
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function ProjectRow({
  project,
  latestJob,
  busy,
  onQueue,
}: {
  project: OpenRepoProject;
  latestJob?: OpenRepoJob;
  busy: boolean;
  onQueue: () => void;
}) {
  const sourceLabel =
    project.source.type === "github_repo"
      ? project.source.url
      : `${project.source.documentNames.length} document${project.source.documentNames.length === 1 ? "" : "s"}`;
  const command = latestJob?.commandHint ?? `/openrepo-analyze ${project.id}`;

  return (
    <article className="grid gap-4 px-4 py-4 xl:grid-cols-[1fr_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-heading text-lg text-text-primary">{project.name}</h3>
          <span className="rounded border border-border-medium px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {project.type === "github_repo" ? "repo" : "docs"}
          </span>
          {latestJob && (
            <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusClass(latestJob.status)}`}>
              {latestJob.status.replace("_", " ")}
            </span>
          )}
        </div>
        <p className="mt-1 truncate font-mono text-xs text-text-muted">{sourceLabel}</p>
        <div className="mt-3 rounded-md border border-border-subtle bg-root px-3 py-2 font-mono text-xs text-text-secondary">
          {command}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 xl:justify-end">
        <button
          type="button"
          onClick={onQueue}
          disabled={busy}
          className="rounded-md border border-border-medium bg-elevated px-3 py-2 text-sm font-semibold text-text-secondary transition hover:text-text-primary disabled:opacity-50"
        >
          {busy ? "Queuing..." : "Queue Analysis"}
        </button>
        <a
          href={`/?project=${encodeURIComponent(project.id)}`}
          className="rounded-md bg-accent px-3 py-2 text-sm font-bold text-black transition hover:bg-accent-bright"
        >
          Open Graph
        </a>
      </div>
    </article>
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
