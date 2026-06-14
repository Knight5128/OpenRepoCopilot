import type { IncomingMessage, ServerResponse } from "node:http";
import { OpenRepoAnalysisWorker } from "./analysis-worker.js";
import { agentProviderPresets } from "./providers.js";
import { OpenRepoStore } from "./store.js";

type Next = () => void;

export function createOpenRepoApiMiddleware(store = new OpenRepoStore()) {
  const worker = new OpenRepoAnalysisWorker(store);
  return async function openRepoApi(req: IncomingMessage, res: ServerResponse, next: Next): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const { pathname } = url;
    if (!pathname.startsWith("/api/")) {
      next();
      return;
    }

    try {
      if (req.method === "GET" && pathname === "/api/projects") {
        sendJson(res, 200, { projects: store.listProjects() });
        return;
      }

      if (req.method === "GET" && pathname === "/api/settings") {
        sendJson(res, 200, settingsPayload(store));
        return;
      }

      if (req.method === "PUT" && pathname === "/api/settings") {
        const body = await readJson(req);
        if (!isRecord(body)) throw new Error("Expected JSON settings body.");
        store.writeSettings(body);
        sendJson(res, 200, settingsPayload(store));
        return;
      }

      if (req.method === "POST" && pathname === "/api/agent/test") {
        const body = await readJson(req);
        const agent = isRecord(body) && isRecord(body.agent) ? body.agent : undefined;
        await store.testAgentConnection(agent);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && pathname === "/api/projects/github") {
        const body = await readJson(req);
        if (!isRecord(body) || typeof body.url !== "string") throw new Error("Expected JSON body with url.");
        const project = await store.createGithubProject(body.url);
        sendJson(res, 201, { project });
        return;
      }

      if (req.method === "POST" && pathname === "/api/projects/documents") {
        const body = await readJson(req);
        if (!isRecord(body) || typeof body.name !== "string" || !Array.isArray(body.files)) {
          throw new Error("Expected JSON body with name and files.");
        }
        const project = store.createDocumentProject(body.name, body.files);
        sendJson(res, 201, { project });
        return;
      }

      const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)(?:\/([^/]+))?$/);
      if (projectMatch) {
        const projectId = decodeURIComponent(projectMatch[1]);
        const action = projectMatch[2];
        if (req.method === "GET" && !action) {
          sendJson(res, 200, { project: store.readProject(projectId), jobs: store.listJobs(projectId) });
          return;
        }
        if (req.method === "POST" && action === "analysis-jobs") {
          const job = store.createAnalysisJob(projectId);
          if (store.readSettings().agent.autoRunJobs) worker.start(projectId);
          sendJson(res, 201, { job });
          return;
        }
        if (req.method === "GET" && action === "graph") {
          sendJson(res, 200, store.readGraph(projectId));
          return;
        }
        if (req.method === "GET" && action === "meta") {
          sendJson(res, 200, store.readOptionalJson(projectId, "meta.json") ?? {});
          return;
        }
        if (req.method === "GET" && action === "config") {
          sendJson(res, 200, store.readOptionalJson(projectId, "config.json") ?? { autoUpdate: false, outputLanguage: "en" });
          return;
        }
        if (req.method === "GET" && action === "domain-graph") {
          const graph = store.readOptionalJson(projectId, "domain-graph.json");
          if (!graph) sendJson(res, 404, { error: "Domain graph not found." });
          else sendJson(res, 200, graph);
          return;
        }
        if (req.method === "GET" && action === "diff-overlay") {
          const diff = store.readOptionalJson(projectId, "diff-overlay.json");
          if (!diff) sendJson(res, 404, { error: "Diff overlay not found." });
          else sendJson(res, 200, diff);
          return;
        }
        if (req.method === "GET" && action === "file-content") {
          sendJson(res, 200, store.readSourceFile(projectId, url.searchParams.get("path") ?? ""));
          return;
        }
      }

      if (req.method === "PATCH" && pathname === "/api/jobs/order") {
        const body = await readJson(req);
        if (!isRecord(body) || !Array.isArray(body.jobIds) || !body.jobIds.every((id) => typeof id === "string")) {
          throw new Error("Expected JSON body with jobIds.");
        }
        sendJson(res, 200, { jobs: store.reorderJobs(body.jobIds) });
        return;
      }

      const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (req.method === "GET" && jobMatch) {
        sendJson(res, 200, { job: store.readJob(decodeURIComponent(jobMatch[1])) });
        return;
      }
      if (req.method === "GET" && pathname.match(/^\/api\/jobs\/([^/]+)\/log$/)) {
        const logMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/log$/);
        sendJson(res, 200, { log: store.readJobLog(decodeURIComponent(logMatch![1])) });
        return;
      }
      if (req.method === "DELETE" && jobMatch) {
        store.deleteJob(decodeURIComponent(jobMatch[1]));
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { error: "Not found." });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function settingsPayload(store: OpenRepoStore): Record<string, unknown> {
  return {
    settings: store.readSettings(),
    agentStatus: store.readAgentStatus(),
    providerPresets: agentProviderPresets(),
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
