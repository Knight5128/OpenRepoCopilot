@echo off
setlocal

set "OPENREPO_APP_ROOT=%~dp0..\.."
for %%I in ("%OPENREPO_APP_ROOT%") do set "OPENREPO_APP_ROOT=%%~fI"
cd /d "%OPENREPO_APP_ROOT%"

if not defined OPENREPO_HOME (
  set "OPENREPO_HOME=%USERPROFILE%\.openrepo-copilot"
)

where node >nul 2>nul
if errorlevel 1 (
  echo OpenRepoCopilot requires Node.js to run.
  echo Install Node.js LTS, then start OpenRepoCopilot again.
  pause
  exit /b 1
)

set "OPENREPO_PNPM=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 (
  where corepack >nul 2>nul
  if errorlevel 1 (
    echo OpenRepoCopilot requires pnpm or Corepack to run.
    echo Install a current Node.js LTS release with Corepack, then start OpenRepoCopilot again.
    pause
    exit /b 1
  )
  set "OPENREPO_PNPM=corepack pnpm"
)

if not exist "%OPENREPO_APP_ROOT%\node_modules\.modules.yaml" (
  echo Installing OpenRepoCopilot dependencies. This runs once per install location.
  %OPENREPO_PNPM% install --frozen-lockfile
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

%OPENREPO_PNPM% app:start
if errorlevel 1 (
  echo OpenRepoCopilot exited with an error.
  pause
  exit /b 1
)
