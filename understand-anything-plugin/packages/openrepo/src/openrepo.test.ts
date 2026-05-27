import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseGitHubRepoUrl } from "./github.js";
import { assertSupportedDocument, convertDocumentToMarkdown } from "./documents.js";
import { OpenRepoStore } from "./store.js";

const tempDirs: string[] = [];

afterEach(() => {
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

  it("creates a document knowledge-base project", () => {
    const store = new OpenRepoStore({ home: tempHome() });
    const project = store.createDocumentProject("Docs", [
      { name: "a.md", contentBase64: Buffer.from("# A").toString("base64") },
    ]);

    expect(project.type).toBe("document_kb");
    expect(fs.existsSync(path.join(project.sourcePath, "knowledge.md"))).toBe(true);
  });
});
