#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = path.join(repoRoot, "release");
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const packageName = `openrepo-copilot-app-${timestamp}`;
const stageDir = path.join(releaseRoot, packageName);
const archivePath = `${stageDir}.zip`;

const distDirs = [
  "understand-anything-plugin/packages/core/dist",
  "understand-anything-plugin/packages/openrepo/dist",
  "understand-anything-plugin/packages/dashboard/dist",
];

const extraPackageDirs = [
  "understand-anything-plugin/packages/openrepo/examples/nanogpt/.understand-anything",
];

main();

function main() {
  ensureInside(stageDir, releaseRoot);
  ensureInside(archivePath, releaseRoot);

  run("pnpm", ["--filter", "@understand-anything/core", "build"]);
  run("pnpm", ["--filter", "@openrepo-copilot/server", "build"]);
  run("pnpm", ["--filter", "@understand-anything/dashboard", "build"]);

  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  for (const file of gitFiles()) {
    copyFile(file, path.join(stageDir, file));
  }

  for (const dir of extraPackageDirs) {
    const source = path.join(repoRoot, dir);
    if (!fs.existsSync(source)) {
      throw new Error(`Expected packaged resource not found: ${dir}`);
    }
    copyDirectory(source, path.join(stageDir, dir));
  }

  for (const dir of distDirs) {
    const source = path.join(repoRoot, dir);
    if (!fs.existsSync(source)) {
      throw new Error(`Expected build output not found: ${dir}`);
    }
    copyDirectory(source, path.join(stageDir, dir));
  }

  writeManifest();
  createArchive();

  console.log("");
  console.log(`Packaged app directory: ${path.relative(repoRoot, stageDir)}`);
  console.log(`Packaged app archive:   ${path.relative(repoRoot, archivePath)}`);
}

function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${command} ${args.join(" ")}`);
  }
}

function gitFiles() {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr}`);
  }
  return result.stdout.split("\0").filter(Boolean).sort();
}

function copyFile(sourceRelative, target) {
  const source = path.join(repoRoot, sourceRelative);
  if (!fs.existsSync(source)) return;
  if (!fs.statSync(source).isFile()) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function writeManifest() {
  const manifest = {
    name: packageName,
    createdAt: new Date().toISOString(),
    source: "OpenRepoCopilot",
    buildOutputs: distDirs,
    bundledResources: extraPackageDirs,
    defaultAgent: {
      provider: "dashscope",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "glm-5.1",
      apiKeyEnv: "DASHSCOPE_API_KEY",
      apiKeyFile: "<OPENREPO_HOME>/agent.env",
    },
    archive: path.basename(archivePath),
  };
  fs.writeFileSync(path.join(stageDir, "package-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function createArchive() {
  fs.rmSync(archivePath, { force: true });

  const tarResult = spawnSync("tar", ["-a", "-cf", archivePath, "-C", releaseRoot, packageName], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (tarResult.status === 0) return;

  if (process.platform !== "win32") {
    throw new Error("Could not create zip archive. Install tar/bsdtar or zip and rerun pnpm package:app.");
  }

  const command = [
    "Compress-Archive",
    "-LiteralPath",
    quotePowerShell(stageDir),
    "-DestinationPath",
    quotePowerShell(archivePath),
    "-Force",
  ].join(" ");
  const psResult = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (psResult.error) throw psResult.error;
  if (psResult.status !== 0) {
    throw new Error("Could not create zip archive with tar or Compress-Archive.");
  }
}

function quotePowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function ensureInside(candidate, root) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside release directory: ${candidate}`);
  }
}
