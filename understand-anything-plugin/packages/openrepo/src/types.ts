export type OpenRepoProjectType = "github_repo" | "document_kb";

export type OpenRepoJobKind = "code" | "knowledge";

export type OpenRepoJobStatus = "queued" | "in_progress" | "completed" | "failed";

export interface GithubProjectSource {
  type: "github_repo";
  url: string;
  owner: string;
  repo: string;
  branch?: string;
}

export interface DocumentProjectSource {
  type: "document_kb";
  documentNames: string[];
}

export interface OpenRepoProject {
  id: string;
  name: string;
  type: OpenRepoProjectType;
  createdAt: string;
  updatedAt: string;
  sourcePath: string;
  graphPath: string;
  latestJobId?: string;
  source: GithubProjectSource | DocumentProjectSource;
}

export interface OpenRepoJob {
  id: string;
  projectId: string;
  kind: OpenRepoJobKind;
  status: OpenRepoJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  commandHint: string;
}

export interface UploadedDocument {
  name: string;
  contentBase64: string;
}

export type OpenRepoThemeMode = "light" | "dark" | "system";

export interface OpenRepoSettings {
  themeMode: OpenRepoThemeMode;
  agentApiBaseUrl: string;
  agentApiKeyEnv: string;
  cloneRootPath: string;
  graphExportPath: string;
}
