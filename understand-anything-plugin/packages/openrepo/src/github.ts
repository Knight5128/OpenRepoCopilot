import { spawn } from "node:child_process";
import fs from "node:fs";

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  normalizedUrl: string;
}

export function parseGitHubRepoUrl(input: string): ParsedGitHubRepo {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid GitHub repository URL.");
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Only public https://github.com/<owner>/<repo> repositories are supported.");
  }

  const parts = url.pathname
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);

  if (parts.length !== 2) {
    throw new Error("GitHub repository URL must look like https://github.com/<owner>/<repo>.");
  }

  const [owner, rawRepo] = parts;
  const repo = rawRepo.replace(/\.git$/i, "");
  const namePattern = /^[A-Za-z0-9_.-]+$/;
  if (!owner || !repo || !namePattern.test(owner) || !namePattern.test(repo)) {
    throw new Error("GitHub owner and repository names contain unsupported characters.");
  }

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
  };
}

export async function clonePublicGitHubRepo(repo: ParsedGitHubRepo, targetDir: string): Promise<void> {
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error("Project source directory is not empty.");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "git",
      ["clone", "--depth", "1", `${repo.normalizedUrl}.git`, targetDir],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `git clone failed with exit code ${code}`));
    });
  });
}
