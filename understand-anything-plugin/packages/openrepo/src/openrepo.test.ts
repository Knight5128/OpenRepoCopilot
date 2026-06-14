import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleAgentClient, chatCompletionsUrl } from "./agent-client.js";
import { parseGitHubRepoUrl } from "./github.js";
import { assertSupportedDocument, convertDocumentToMarkdown } from "./documents.js";
import { AGENT_PROVIDER_PRESETS } from "./providers.js";
import { OpenRepoStore } from "./store.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openrepo-"));
  tempDirs.push(dir);
  return dir;
}

describe("parseGitHubRepoUrl", () => {
  it("normalizes public GitHub repository URLs", () => {
    expect(parseGitHubRepoUrl("https://github.com/Lum1104/Understand-Anything.git")).toEqual({
      owner: "Lum1104",
      repo: "Understand-Anything",
      normalizedUrl: "https://github.com/Lum1104/Understand-Anything",
    });
  });

  it("rejects non-GitHub URLs", () => {
    expect(() => parseGitHubRepoUrl("https://gitlab.com/org/repo")).toThrow(/Only public/);
  });
});

describe("documents", () => {
  it("accepts planned v1 document formats", () => {
    expect(assertSupportedDocument("README.md")).toBe(".md");
    expect(assertSupportedDocument("notes.txt")).toBe(".txt");
    expect(assertSupportedDocument("paper.pdf")).toBe(".pdf");
    expect(assertSupportedDocument("brief.docx")).toBe(".docx");
  });

  it("rejects unsupported document formats", () => {
    expect(() => assertSupportedDocument("slides.pptx")).toThrow(/Unsupported/);
  });

  it("converts plain text formats to markdown text", () => {
    expect(convertDocumentToMarkdown("notes.txt", Buffer.from("hello"))).toBe("hello");
  });
});

describe("OpenRepoStore", () => {
  it("defaults to GLM-5.1 through DashScope compatible mode", () => {
    const store = new OpenRepoStore({ home: tempHome() });
    const settings = store.readSettings();

    expect(settings.agent.provider).toBe("dashscope");
    expect(settings.agent.model).toBe("glm-5.1");
    expect(settings.agent.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(settings.agent.apiKeyEnv).toBe("DASHSCOPE_API_KEY");
    expect(AGENT_PROVIDER_PRESETS.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("migrates legacy flat settings into nested settings", () => {
    const home = tempHome();
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, "settings.json"), JSON.stringify({
      themeMode: "dark",
      agentApiBaseUrl: "https://example.test/v1",
      agentApiKeyEnv: "EXAMPLE_API_KEY",
      cloneRootPath: path.join(home, "legacy-clones"),
      graphExportPath: path.join(home, "legacy-exports"),
    }));

    const settings = new OpenRepoStore({ home }).readSettings();

    expect(settings.appearance.themeMode).toBe("dark");
    expect(settings.agent.baseUrl).toBe("https://example.test/v1");
    expect(settings.agent.apiKeyEnv).toBe("EXAMPLE_API_KEY");
    expect(settings.storage.cloneRootPath).toBe(path.join(home, "legacy-clones"));
    expect(settings.storage.graphExportPath).toBe(path.join(home, "legacy-exports"));
  });

  it("reads agent keys from environment before agent.env", () => {
    const home = tempHome();
    fs.writeFileSync(path.join(home, "agent.env"), "DASHSCOPE_API_KEY=file-key\n");
    const store = new OpenRepoStore({ home });
    const original = process.env.DASHSCOPE_API_KEY;

    process.env.DASHSCOPE_API_KEY = "env-key";
    expect(store.readAgentStatus()).toMatchObject({
      apiKeyConfigured: true,
      activeApiKeyEnv: "DASHSCOPE_API_KEY",
      apiKeyFilePath: path.join(home, "agent.env"),
    });

    if (original === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = original;
  });

  it("creates projects and moves analysis jobs through states", async () => {
    const store = new OpenRepoStore({ home: tempHome() });
    const project = await store.createGithubProject("https://github.com/owner/repo", { clone: false });
    const job = store.createAnalysisJob(project.id);
    const claimed = store.claimNextJob(project.id);
    const completed = store.completeJob(job.id);

    expect(project.id).toBe("owner-repo");
    expect(store.listProjects()).toHaveLength(1);
    expect(job.status).toBe("queued");
    expect(claimed.status).toBe("in_progress");
    expect(completed.status).toBe("completed");
  });

  it("reorders and deletes analysis jobs", async () => {
    const store = new OpenRepoStore({ home: tempHome() });
    const project = await store.createGithubProject("https://github.com/owner/repo", { clone: false });
    const first = store.createAnalysisJob(project.id);
    const second = store.createAnalysisJob(project.id);

    store.reorderJobs([second.id, first.id]);
    const claimed = store.claimNextJob(project.id);
    store.deleteJob(first.id);

    expect(claimed.id).toBe(second.id);
    expect(store.listJobs(project.id).map((job) => job.id)).not.toContain(first.id);
    expect(() => store.readJob(first.id)).toThrow(/Job not found/);
  });

  it("creates a document knowledge-base project", () => {
    const store = new OpenRepoStore({ home: tempHome() });
    const project = store.createDocumentProject("Docs", [
      { name: "a.md", contentBase64: Buffer.from("# A").toString("base64") },
    ]);

    expect(project.type).toBe("document_kb");
    expect(fs.existsSync(path.join(project.sourcePath, "knowledge.md"))).toBe(true);
  });
});

describe("OpenAICompatibleAgentClient", () => {
  it("builds chat completions URLs without duplicate slashes", () => {
    expect(chatCompletionsUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1/chat/completions");
  });

  it("sends OpenAI-compatible chat completion requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "OK" } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAICompatibleAgentClient({
      provider: "dashscope",
      model: "glm-5.1",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKeyEnv: "DASHSCOPE_API_KEY",
      autoRunJobs: true,
      requestTimeout: 120000,
      maxConcurrency: 2,
    }, "secret-key");

    await expect(client.createChatCompletion({
      messages: [{ role: "user", content: "ping" }],
      temperature: 0,
    })).resolves.toBe("OK");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json",
        }),
      }),
    );
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const requestInit = calls[0][1];
    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      model: "glm-5.1",
      stream: false,
      temperature: 0,
    });
  });
});
