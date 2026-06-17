#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, Tray, dialog, nativeImage, shell } from "electron";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardDir = path.join(repoRoot, "understand-anything-plugin", "packages", "dashboard");
const appIcon = path.join(repoRoot, "assets", "openrepo-copilot-logo.ico");
const trayIcon = path.join(repoRoot, "assets", "openrepo-copilot-tray.png");
const defaultDashboardPort = Number.parseInt(process.env.OPENREPO_APP_PORT ?? "5173", 10);

let mainWindow = null;
let tray = null;
let dashboardProcess = null;
let isQuitting = false;
let dashboardUrl = "";

app.setName("OpenRepoCopilot");

app.whenReady()
  .then(async () => {
    const dashboardPort = await findAvailablePort(Number.isFinite(defaultDashboardPort) ? defaultDashboardPort : 5173);
    dashboardUrl = `http://127.0.0.1:${dashboardPort}/`;
    dashboardProcess = startDashboardServer(dashboardPort);
    await waitForUrl(dashboardUrl);
    createMainWindow();
    createTray();

    app.on("activate", () => {
      showMainWindow();
    });
  })
  .catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    appendLog(`[openrepo-copilot] Failed to start:\n${message}\n`);
    dialog.showErrorBox("OpenRepoCopilot failed to start", `${message}\n\nLog: ${logPath()}`);
    app.quit();
  });

app.on("before-quit", () => {
  isQuitting = true;
  stopDashboardServer();
});

app.on("window-all-closed", (event) => {
  if (!isQuitting) event.preventDefault();
});

function startDashboardServer(port) {
  const { command, args } = pnpmInvocation([
    "--dir",
    dashboardDir,
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ]);
  appendLog(`[openrepo-copilot] Starting dashboard server: ${command} ${args.join(" ")}\n`);

  const child = spawn(command, args, {
    cwd: dashboardDir,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      OPENREPO_NO_OPEN: "true",
      VITE_OPENREPO_MODE: "true",
    },
  });

  child.stdout?.on("data", (chunk) => appendLog(chunk));
  child.stderr?.on("data", (chunk) => appendLog(chunk));
  child.on("error", (error) => {
    appendLog(`[openrepo-copilot] Dashboard server spawn failed: ${error.stack ?? error.message}\n`);
  });

  child.on("exit", (code, signal) => {
    dashboardProcess = null;
    if (!isQuitting) {
      appendLog(`[openrepo-copilot] Dashboard server exited: code=${code ?? "null"} signal=${signal ?? "null"}\n`);
      app.quit();
    }
  });

  return child;
}

function stopDashboardServer() {
  if (!dashboardProcess || dashboardProcess.killed) return;
  dashboardProcess.kill();
  dashboardProcess = null;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "OpenRepoCopilot",
    icon: appIcon,
    show: false,
    backgroundColor: "#071116",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadURL(dashboardUrl);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(trayIcon);
  tray = new Tray(icon);
  tray.setToolTip("OpenRepoCopilot");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => {
    showMainWindow();
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Show OpenRepoCopilot",
      click: () => showMainWindow(),
    },
    {
      label: "Hide",
      click: () => mainWindow?.hide(),
    },
    {
      label: "Reload",
      click: () => mainWindow?.reload(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function waitForUrl(url) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await canConnect(url)) return;
    await delay(300);
  }
  throw new Error(`Timed out waiting for dashboard server: ${url}`);
}

function canConnect(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" || error?.code === "EACCES") {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(port));
      });
    };
    tryPort(startPort);
  });
}

function pnpmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  const npmNodeExecPath = process.env.npm_node_execpath;
  if (npmExecPath && npmNodeExecPath && fs.existsSync(npmExecPath) && fs.existsSync(npmNodeExecPath)) {
    return { command: npmNodeExecPath, args: [npmExecPath, ...args] };
  }
  return {
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args,
  };
}

function logPath() {
  const logDir = path.join(process.env.OPENREPO_HOME ?? app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, "openrepo-electron.log");
}

function appendLog(message) {
  const text = Buffer.isBuffer(message) ? message.toString("utf8") : String(message);
  fs.appendFileSync(logPath(), text);
}
