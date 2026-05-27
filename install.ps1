<#
.SYNOPSIS
  OpenRepoCopilot installer for Windows (PowerShell).

.DESCRIPTION
  Clones the repo and creates skill symlinks/junctions for the chosen platform.

.EXAMPLE
  ./install.ps1                       # prompt for platform
  ./install.ps1 codex                 # install for codex
  ./install.ps1 -Update               # pull latest changes
  ./install.ps1 -Uninstall codex      # remove links for codex
#>

param(
    [Parameter(Position = 0)]
    [string]$Platform,
    [switch]$Update,
    [string]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$RepoUrl    = if ($env:OPENREPO_REPO_URL) { $env:OPENREPO_REPO_URL } elseif ($env:UA_REPO_URL) { $env:UA_REPO_URL } else { 'https://github.com/Knight5128/OpenRepoCopilot.git' }
$RepoDir    = if ($env:OPENREPO_DIR)      { $env:OPENREPO_DIR }      elseif ($env:UA_DIR)      { $env:UA_DIR }      else { Join-Path $HOME '.openrepo-copilot\repo' }
$PluginLink = Join-Path $HOME '.understand-anything-plugin'

# Platform table — Target = skills directory; Style = "per-skill" | "folder"
$Platforms = [ordered]@{
    gemini      = @{ Target = (Join-Path $HOME '.agents\skills');             Style = 'per-skill' }
    codex       = @{ Target = (Join-Path $HOME '.agents\skills');             Style = 'per-skill' }
    opencode    = @{ Target = (Join-Path $HOME '.agents\skills');             Style = 'per-skill' }
    pi          = @{ Target = (Join-Path $HOME '.agents\skills');             Style = 'per-skill' }
    openclaw    = @{ Target = (Join-Path $HOME '.openclaw\skills');           Style = 'folder' }
    antigravity = @{ Target = (Join-Path $HOME '.gemini\antigravity\skills'); Style = 'folder' }
    vscode      = @{ Target = (Join-Path $HOME '.copilot\skills');            Style = 'per-skill' }
    hermes      = @{ Target = (Join-Path $HOME '.hermes\skills');             Style = 'folder' }
    cline       = @{ Target = (Join-Path $HOME '.cline\skills');              Style = 'folder' }
    kimi        = @{ Target = (Join-Path $HOME '.kimi\skills');               Style = 'folder' }
    trae        = @{ Target = (Join-Path $HOME '.trae\skills');               Style = 'per-skill' }
}

function Show-Usage {
    @"
OpenRepoCopilot installer (Windows)

Usage:
  install.ps1 [<platform>]                Install for <platform> (or prompt if omitted)
  install.ps1 -Update                     Pull latest changes
  install.ps1 -Uninstall <platform>       Remove links for <platform>
  install.ps1 -Help

Supported platforms:
$($Platforms.Keys -join ', ')

Environment:
  OPENREPO_REPO_URL  Override clone URL
  OPENREPO_DIR       Override clone destination (default: %USERPROFILE%\.openrepo-copilot\repo)
  UA_REPO_URL        Backward-compatible alias for OPENREPO_REPO_URL
  UA_DIR             Backward-compatible alias for OPENREPO_DIR
"@
}

function Resolve-Platform([string]$Id) {
    if (-not $Platforms.Contains($Id)) {
        Write-Error "Unknown platform: $Id. Supported: $($Platforms.Keys -join ', ')"
    }
    return $Platforms[$Id]
}

function Prompt-Platform {
    $ids = @($Platforms.Keys)
    Write-Host 'Which platform are you installing for?'
    for ($i = 0; $i -lt $ids.Count; $i++) {
        Write-Host ("  {0}) {1}" -f ($i + 1), $ids[$i])
    }
    $choice = Read-Host ("Choose [1-{0}]" -f $ids.Count)
    $n = 0
    if (-not [int]::TryParse($choice, [ref]$n) -or $n -lt 1 -or $n -gt $ids.Count) {
        Write-Error "Invalid choice: $choice"
    }
    return $ids[$n - 1]
}

function Get-SkillsRoot { Join-Path $RepoDir 'understand-anything-plugin\skills' }

function Clone-Or-Update {
    if (Test-Path (Join-Path $RepoDir '.git')) {
        Write-Host "→ Updating existing checkout at $RepoDir"
        git -C $RepoDir pull --ff-only
    } else {
        Write-Host "→ Cloning $RepoUrl → $RepoDir"
        $parent = Split-Path -Parent $RepoDir
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
        git clone $RepoUrl $RepoDir
    }
}

function Check-Requirements {
    $missing = @()
    foreach ($cmd in @('git', 'node', 'pnpm')) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            $missing += $cmd
        }
    }
    if ($missing.Count -gt 0) {
        Write-Error "Missing required command(s): $($missing -join ', '). Install them, then run this installer again."
    }
}

function Build-OpenRepo {
    Write-Host '-> Installing dependencies and building OpenRepoCopilot packages'
    Push-Location $RepoDir
    try {
        pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            pnpm install
            if ($LASTEXITCODE -ne 0) { Write-Error 'pnpm install failed.' }
        }

        pnpm --filter '@understand-anything/core' build
        if ($LASTEXITCODE -ne 0) { Write-Error 'Core build failed.' }
        pnpm --filter '@openrepo-copilot/server' build
        if ($LASTEXITCODE -ne 0) { Write-Error 'OpenRepo server build failed.' }
        pnpm --filter '@understand-anything/dashboard' build
        if ($LASTEXITCODE -ne 0) { Write-Error 'Dashboard build failed.' }
    } finally {
        Pop-Location
    }
}

function Get-SkillNames {
    $root = Get-SkillsRoot
    if (-not (Test-Path $root)) { Write-Error "Skills directory not found: $root" }
    Get-ChildItem -Path $root -Directory | Select-Object -ExpandProperty Name
}

function Test-IsReparse([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item -LiteralPath $Path -Force
    return ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink')
}

function Remove-Reparse([string]$Path) {
    # Removes a junction/symlink without touching its target. Refuses to touch
    # real files or directories so an existing user folder at the same path is
    # never destroyed.
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
        $item.Delete()
        return $true
    }
    Write-Warning "Refusing to delete $Path — it is a real file/directory, not a junction/symlink we created. Remove it manually if you intended to."
    return $false
}

function New-Junction([string]$LinkPath, [string]$TargetPath) {
    if (Test-Path $LinkPath) {
        if (Test-IsReparse $LinkPath) {
            (Get-Item -LiteralPath $LinkPath -Force).Delete()
        } else {
            Write-Error "Refusing to overwrite $LinkPath — it is a real file/directory, not a junction. Move or remove it first."
        }
    }
    New-Item -ItemType Junction -Path $LinkPath -Target $TargetPath | Out-Null
}

function Link-Skills([string]$Target, [string]$Style) {
    $root = Get-SkillsRoot
    if (-not (Test-Path $Target)) { New-Item -ItemType Directory -Path $Target | Out-Null }

    switch ($Style) {
        'per-skill' {
            foreach ($skill in Get-SkillNames) {
                $link = Join-Path $Target $skill
                $src  = Join-Path $root $skill
                New-Junction $link $src
                Write-Host "  ✓ $link → $src"
            }
        }
        'folder' {
            $link = Join-Path $Target 'understand-anything'
            New-Junction $link $root
            Write-Host "  ✓ $link → $root"
        }
        default { Write-Error "Unknown style: $Style" }
    }
}

function Unlink-Skills([string]$Target, [string]$Style) {
    if (-not (Test-Path $Target)) { return }
    switch ($Style) {
        'per-skill' {
            $skillsRoot = Get-SkillsRoot
            if (Test-Path $skillsRoot) {
                foreach ($skill in Get-SkillNames) {
                    Remove-Reparse (Join-Path $Target $skill) | Out-Null
                }
            } else {
                # Checkout is gone — scan the target dir for stale links pointing
                # into our plugin tree so we can still clean up.
                Get-ChildItem -LiteralPath $Target -Force | ForEach-Object {
                    if ($_.LinkType -eq 'Junction' -or $_.LinkType -eq 'SymbolicLink') {
                        if ($_.Target -match 'understand-anything-plugin[\\/]+skills[\\/]+') {
                            Remove-Reparse $_.FullName | Out-Null
                        }
                    }
                }
            }
        }
        'folder' {
            Remove-Reparse (Join-Path $Target 'understand-anything') | Out-Null
        }
    }
}

function Link-Plugin-Root {
    if (Test-Path $PluginLink) {
        Write-Host "  • $PluginLink already exists, leaving as-is"
    } else {
        $src = Join-Path $RepoDir 'understand-anything-plugin'
        New-Item -ItemType Junction -Path $PluginLink -Target $src | Out-Null
        Write-Host "  ✓ $PluginLink → $src"
    }
}

function Cmd-Install([string]$Id) {
    $cfg = Resolve-Platform $Id
    Check-Requirements
    Clone-Or-Update
    Build-OpenRepo
    Write-Host "→ Linking skills for $Id ($($cfg.Style) → $($cfg.Target))"
    Link-Skills $cfg.Target $cfg.Style
    Write-Host '→ Linking universal plugin root'
    Link-Plugin-Root

    Write-Host "`nDone. Installed OpenRepoCopilot for $Id"
    Write-Host '  Restart your CLI or IDE to pick up the skills.'
    Write-Host '  OpenRepoCopilot commands: /openrepo and /openrepo-analyze <project-id>.'
    if ($Id -eq 'vscode') {
        Write-Host "`n  Tip: VS Code can also auto-discover the plugin by opening this repo"
        Write-Host '       directly (it reads .copilot-plugin/plugin.json), no symlinks needed.'
    }
}

function Cmd-Uninstall([string]$Id) {
    $cfg = Resolve-Platform $Id
    Write-Host "→ Removing skill links for $Id"
    Unlink-Skills $cfg.Target $cfg.Style
    if (Remove-Reparse $PluginLink) {
        Write-Host "  ✓ removed $PluginLink"
    }
    if (Test-Path $RepoDir) {
        Write-Host "`nThe checkout at $RepoDir was kept (other platforms may still use it)."
        Write-Host "To remove it: Remove-Item -Recurse -Force '$RepoDir'"
    }
}

function Cmd-Update {
    if (-not (Test-Path (Join-Path $RepoDir '.git'))) {
        Write-Error "No installation found at $RepoDir. Run install first."
    }
    git -C $RepoDir pull --ff-only
    Write-Host '✓ Updated.'
}

if ($Help) { Show-Usage; return }
if ($Update) { Cmd-Update; return }
if ($Uninstall) { Cmd-Uninstall $Uninstall; return }

if (-not $Platform) { $Platform = Prompt-Platform }
Cmd-Install $Platform
