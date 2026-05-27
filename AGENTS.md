# AGENTS.md

## 项目定位

OpenRepoCopilot 是一个本地优先的代码仓库理解与知识图谱工作台。项目包含 agent skills、CLI/server、dashboard 前端和安装脚本，目标是让组员可以快速安装 CLI 版本，并在本地继续开发新功能。

## 核心原则

- 优先小而可 review 的 diff，不做无关重构。
- 修改前先搜索现有实现，沿用项目已有结构、命名和风格。
- 不要发明 API、配置名或路径；不确定时先用 `rg` 或查看相关 `package.json`。
- 行为变更要补充或更新测试；若无法测试，在回复里说明原因。
- 不提交本地缓存、构建产物、密钥或个人工作区文件。

## 安全与隐私

- 不要提交 `.env`、token、私钥、账号密码或任何凭据。
- 不要把本地绝对路径、个人目录结构或私有项目内容写进示例数据。
- 不新增 analytics、telemetry 或联网调用，除非 issue/需求明确要求。
- 本地 dashboard 和 OpenRepoCopilot workbench 应绑定 `127.0.0.1`。

## 目录速查

- `package.json`：根工作区命令入口。
- `install.ps1`：Windows 一键安装入口。
- `install.sh`：macOS / Linux 一键安装入口。
- `understand-anything-plugin/packages/core`：核心分析、图谱、语言解析逻辑。
- `understand-anything-plugin/packages/openrepo`：OpenRepoCopilot CLI/server/API。
- `understand-anything-plugin/packages/dashboard`：React dashboard。
- `understand-anything-plugin/skills`：agent skills。
- `tests/skill`：skill 脚本相关测试。
- `.private/`：本地协作文档和临时资料，不上传 GitHub。
- `release/`：本地 app 打包输出，不上传 GitHub。

## 常用命令

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm dev:dashboard
pnpm package:app
```

最快相关检查优先：

- 改 core：`pnpm --filter @understand-anything/core build`
- 改 CLI/server：`pnpm --filter @openrepo-copilot/server build`
- 改 dashboard：`pnpm --filter @understand-anything/dashboard build`
- 改 packaging：`pnpm package:app`
- 改 skill：运行对应测试或至少校验 `SKILL.md` 结构。

## 打包规范

当前项目 app 版本使用：

```powershell
pnpm package:app
```

输出到：

```text
release/openrepo-copilot-app-<timestamp>/
release/openrepo-copilot-app-<timestamp>.zip
```

`release/` 已被忽略，不要提交。需要让 agent 一键打包时，优先使用 `understand-anything-plugin/skills/openrepo-package`。

## 安装入口规范

Windows 快速安装命令：

```powershell
iwr -useb https://raw.githubusercontent.com/Knight5128/OpenRepoCopilot/main/install.ps1 | iex
```

macOS / Linux 快速安装命令：

```bash
curl -fsSL https://raw.githubusercontent.com/Knight5128/OpenRepoCopilot/main/install.sh | bash
```

安装脚本默认仓库必须保持为：

```text
https://github.com/Knight5128/OpenRepoCopilot.git
```

## Agent 协作要求

- 解释默认使用中文，保持简洁，给出具体命令和验证结果。
- 修改代码前说明计划和会触碰的文件。
- 不要回滚他人未说明要回滚的改动。
- 不要提交 `.private/`、`release/`、`.pnpm-store/`、`node_modules/`、`.env*`。
- 如果任务涉及库、框架、SDK、API、CLI 或云服务的用法，先用 Context7 MCP 查询当前文档。
- 如果任务是 code review，先列问题，按严重程度排序，并给出文件和行号。

## Git 流程

```powershell
git checkout main
git pull --ff-only
git checkout -b feat/<short-name>
```

提交前至少执行：

```powershell
git status --short
git diff --check
```

提交信息建议使用清晰的动词短句，例如：

```text
Add OpenRepoCopilot app packaging workflow
Fix installer repository defaults
```
