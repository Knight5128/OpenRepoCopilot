export type WorkbenchLanguage = "zh" | "en" | "ja";

type ThemeMode = "light" | "dark" | "system";
type JobStatus = "queued" | "in_progress" | "completed" | "failed";

export const workbenchLanguageOptions: Array<{ value: WorkbenchLanguage; label: string }> = [
  { value: "zh", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

export interface WorkbenchCopy {
  common: {
    workbench: string;
    createNewProject: string;
    projects: string;
    refresh: string;
    refreshing: string;
    noProjects: string;
    globalSettings: string;
    backToWorkbench: string;
    expandSidebar: string;
    collapseSidebar: string;
    themeTitle: (mode: ThemeMode) => string;
    useTheme: (mode: ThemeMode) => string;
    currentThemeSwitch: (mode: ThemeMode) => string;
  };
  notices: {
    projectListRefreshed: string;
    repositoryProjectCreated: string;
    documentProjectCreated: string;
    analysisQueued: string;
    analysisJobRemoved: string;
    projectDeleted: string;
    queueReordered: string;
    settingsSaved: string;
    agentConnectionPassed: string;
    chooseAtLeastOneDocument: string;
  };
  overview: {
    title: string;
    description: string;
    exploreExisting: string;
    toggleSidebar: string;
    illustrationRepository: string;
    illustrationGraph: string;
    illustrationItems: Array<{ title: string; subtitle: string }>;
    illustrationOutcomes: string[];
  };
  create: {
    newProject: string;
    chooseSource: string;
    github: string;
    documents: string;
    publicGithubRepository: string;
    projectName: string;
    cloning: string;
    importing: string;
    createRepositoryProject: string;
    createDocumentProject: string;
  };
  project: {
    repository: string;
    documents: string;
    deleteProject: string;
    deleting: string;
    beginAnalysis: string;
    starting: string;
    openGraph: string;
    graphNotReady: string;
    graphNotReadyTitle: string;
    latestJob: string;
    workerPhase: string;
    sourcePath: string;
    graphPath: string;
    none: string;
    idle: string;
    analysisStatus: string;
    progress: string;
    lastUpdate: string;
    notStarted: string;
    currentJob: string;
    log: string;
    globalQueue: string;
    total: (count: number) => string;
    noJobs: string;
    dragToReorder: string;
    deleteAnalysisJob: string;
    deleteAnalysisJobAria: (jobId: string) => string;
    sourceDocuments: (count: number) => string;
    deleteProjectConfirm: (name: string) => string;
  };
  settings: {
    globalSettings: string;
    runtimeConfiguration: string;
    appearance: string;
    themeMode: string;
    language: string;
    projectStorage: string;
    cloneRootPath: string;
    graphExportPath: string;
    agentProvider: string;
    apiKeyNote: string;
    keyConfigured: string;
    keyMissing: string;
    apiProvider: string;
    model: string;
    baseUrl: string;
    apiKeyEnv: string;
    keyFile: string;
    restoreProviderPreset: string;
    testConnection: string;
    testing: string;
    analysisRuntime: string;
    autoRunQueuedJobs: string;
    requestTimeout: string;
    maxConcurrency: string;
    saving: string;
    saveSettings: string;
  };
  theme: {
    labels: Record<ThemeMode, string>;
  };
  status: {
    labels: Record<JobStatus, string>;
    idle: string;
    inProgress: string;
    readyToBegin: string;
    waiting: (phase?: string) => string;
    running: (phase?: string) => string;
    completed: string;
    failed: string;
  };
}

const en: WorkbenchCopy = {
  common: {
    workbench: "Workbench",
    createNewProject: "Create new project",
    projects: "Projects",
    refresh: "Refresh",
    refreshing: "Refreshing...",
    noProjects: "No projects yet.",
    globalSettings: "Global settings",
    backToWorkbench: "Back to workbench",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    themeTitle: (mode) => `${en.theme.labels[mode]} theme`,
    useTheme: (mode) => `Use ${en.theme.labels[mode]} theme`,
    currentThemeSwitch: (mode) => `Current theme is ${en.theme.labels[mode]}. Switch theme.`,
  },
  notices: {
    projectListRefreshed: "Project list refreshed.",
    repositoryProjectCreated: "Repository project created.",
    documentProjectCreated: "Document project created.",
    analysisQueued: "Analysis job added to the global queue.",
    analysisJobRemoved: "Analysis job removed from the global queue.",
    projectDeleted: "Project deleted.",
    queueReordered: "Global analysis queue reordered.",
    settingsSaved: "Settings saved.",
    agentConnectionPassed: "Agent connection test passed.",
    chooseAtLeastOneDocument: "Choose at least one document.",
  },
  overview: {
    title: "Repository and knowledge graph workbench",
    description:
      "Analyze repository structure, module relationships, and key concepts locally, then explore the generated knowledge graph for faster understanding, search, and collaboration.",
    exploreExisting: "Explore existing projects",
    toggleSidebar: "Toggle sidebar",
    illustrationRepository: "Code repository",
    illustrationGraph: "Knowledge graph",
    illustrationItems: [
      { title: "Module", subtitle: "Module" },
      { title: "Class / Interface", subtitle: "Class / Interface" },
      { title: "Function / Method", subtitle: "Function / Method" },
      { title: "Dependency", subtitle: "Dependency" },
      { title: "Key concept", subtitle: "Concept" },
    ],
    illustrationOutcomes: ["AI Q&A", "Insight analysis", "Team collaboration"],
  },
  create: {
    newProject: "New project",
    chooseSource: "Choose a source",
    github: "GitHub",
    documents: "Documents",
    publicGithubRepository: "Public GitHub repository",
    projectName: "Project name",
    cloning: "Cloning...",
    importing: "Importing...",
    createRepositoryProject: "Create Repository Project",
    createDocumentProject: "Create Document Project",
  },
  project: {
    repository: "Repository",
    documents: "Documents",
    deleteProject: "Delete Project",
    deleting: "Deleting...",
    beginAnalysis: "Begin Analysis",
    starting: "Starting...",
    openGraph: "Open Graph",
    graphNotReady: "Graph Not Ready",
    graphNotReadyTitle: "Complete an analysis before opening the knowledge graph.",
    latestJob: "Latest job",
    workerPhase: "Worker phase",
    sourcePath: "Source path",
    graphPath: "Graph path",
    none: "none",
    idle: "idle",
    analysisStatus: "Analysis Status",
    progress: "Progress",
    lastUpdate: "Last update",
    notStarted: "Not started",
    currentJob: "Current job",
    log: "Log",
    globalQueue: "Global Analysis Queue",
    total: (count) => `${count} total`,
    noJobs: "No analysis jobs queued yet.",
    dragToReorder: "Drag to reorder",
    deleteAnalysisJob: "Delete analysis job",
    deleteAnalysisJobAria: (jobId) => `Delete analysis job ${jobId}`,
    sourceDocuments: (count) => `${count} document${count === 1 ? "" : "s"}`,
    deleteProjectConfirm: (name) =>
      `Delete "${name}" from OpenRepoCopilot?\n\nThis removes its project record, analysis jobs, and generated graph. Source files stored outside the OpenRepoCopilot project directory will be kept.`,
  },
  settings: {
    globalSettings: "Global settings",
    runtimeConfiguration: "Runtime configuration",
    appearance: "Appearance",
    themeMode: "Theme mode",
    language: "Language",
    projectStorage: "Project storage",
    cloneRootPath: "Project clone root path",
    graphExportPath: "Knowledge graph export path",
    agentProvider: "Agent / model provider",
    apiKeyNote: "API keys are read from environment variables or the local agent.env file only.",
    keyConfigured: "key configured",
    keyMissing: "key missing",
    apiProvider: "API provider",
    model: "Model",
    baseUrl: "Base URL",
    apiKeyEnv: "API key environment variable",
    keyFile: "Key file",
    restoreProviderPreset: "Restore provider preset",
    testConnection: "Test connection",
    testing: "Testing...",
    analysisRuntime: "Analysis runtime",
    autoRunQueuedJobs: "Auto-run queued jobs",
    requestTimeout: "Request timeout (ms)",
    maxConcurrency: "Max concurrency",
    saving: "Saving...",
    saveSettings: "Save settings",
  },
  theme: {
    labels: {
      light: "Light",
      dark: "Dark",
      system: "System",
    },
  },
  status: {
    labels: {
      queued: "queued",
      in_progress: "in progress",
      completed: "completed",
      failed: "failed",
    },
    idle: "idle",
    inProgress: "in progress",
    readyToBegin: "Ready to begin",
    waiting: (phase) => (phase ? `Waiting: ${phase}` : "Waiting in the global queue"),
    running: (phase) => (phase ? `Running: ${phase}` : "Analysis is running"),
    completed: "Analysis completed",
    failed: "Analysis failed",
  },
};

const zh: WorkbenchCopy = {
  common: {
    workbench: "工作台",
    createNewProject: "创建新项目",
    projects: "项目",
    refresh: "刷新",
    refreshing: "刷新中...",
    noProjects: "还没有项目。",
    globalSettings: "全局设置",
    backToWorkbench: "返回工作台",
    expandSidebar: "展开侧边栏",
    collapseSidebar: "收起侧边栏",
    themeTitle: (mode) => `${zh.theme.labels[mode]}主题`,
    useTheme: (mode) => `使用${zh.theme.labels[mode]}主题`,
    currentThemeSwitch: (mode) => `当前主题是${zh.theme.labels[mode]}，点击切换。`,
  },
  notices: {
    projectListRefreshed: "项目列表已刷新。",
    repositoryProjectCreated: "仓库项目已创建。",
    documentProjectCreated: "文档项目已创建。",
    analysisQueued: "分析任务已加入全局队列。",
    analysisJobRemoved: "分析任务已从全局队列移除。",
    projectDeleted: "项目已删除。",
    queueReordered: "全局分析队列已重新排序。",
    settingsSaved: "设置已保存。",
    agentConnectionPassed: "Agent 连接测试通过。",
    chooseAtLeastOneDocument: "请至少选择一个文档。",
  },
  overview: {
    title: "仓库与知识图谱工作台",
    description: "从代码结构、模块关系到关键概念，在本地完成仓库分析并生成可探索的知识图谱，帮助你更快理解、检索和协作。",
    exploreExisting: "探索现有项目",
    toggleSidebar: "切换侧边栏",
    illustrationRepository: "代码仓库",
    illustrationGraph: "知识图谱",
    illustrationItems: [
      { title: "模块", subtitle: "Module" },
      { title: "类 / 接口", subtitle: "Class / Interface" },
      { title: "函数 / 方法", subtitle: "Function / Method" },
      { title: "依赖关系", subtitle: "Dependency" },
      { title: "关键概念", subtitle: "Concept" },
    ],
    illustrationOutcomes: ["智能问答", "洞察分析", "团队协作"],
  },
  create: {
    newProject: "新建项目",
    chooseSource: "选择来源",
    github: "GitHub",
    documents: "文档",
    publicGithubRepository: "公开 GitHub 仓库",
    projectName: "项目名称",
    cloning: "克隆中...",
    importing: "导入中...",
    createRepositoryProject: "创建仓库项目",
    createDocumentProject: "创建文档项目",
  },
  project: {
    repository: "仓库",
    documents: "文档",
    deleteProject: "删除项目",
    deleting: "删除中...",
    beginAnalysis: "开始分析",
    starting: "启动中...",
    openGraph: "打开图谱",
    graphNotReady: "图谱未就绪",
    graphNotReadyTitle: "完成一次分析后才能打开知识图谱。",
    latestJob: "最新任务",
    workerPhase: "Worker 阶段",
    sourcePath: "源文件路径",
    graphPath: "图谱路径",
    none: "无",
    idle: "空闲",
    analysisStatus: "分析状态",
    progress: "进度",
    lastUpdate: "最后更新",
    notStarted: "未开始",
    currentJob: "当前任务",
    log: "日志",
    globalQueue: "全局分析队列",
    total: (count) => `共 ${count} 个`,
    noJobs: "还没有排队的分析任务。",
    dragToReorder: "拖拽调整顺序",
    deleteAnalysisJob: "删除分析任务",
    deleteAnalysisJobAria: (jobId) => `删除分析任务 ${jobId}`,
    sourceDocuments: (count) => `${count} 个文档`,
    deleteProjectConfirm: (name) =>
      `要从 OpenRepoCopilot 删除 "${name}" 吗？\n\n这会移除项目记录、分析任务和生成的图谱。保存在 OpenRepoCopilot 项目目录之外的源文件会被保留。`,
  },
  settings: {
    globalSettings: "全局设置",
    runtimeConfiguration: "运行配置",
    appearance: "外观",
    themeMode: "主题模式",
    language: "语言",
    projectStorage: "项目存储",
    cloneRootPath: "项目克隆根路径",
    graphExportPath: "知识图谱导出路径",
    agentProvider: "Agent / 模型服务商",
    apiKeyNote: "API Key 只会从环境变量或本地 agent.env 文件读取。",
    keyConfigured: "已配置密钥",
    keyMissing: "缺少密钥",
    apiProvider: "API 服务商",
    model: "模型",
    baseUrl: "Base URL",
    apiKeyEnv: "API Key 环境变量",
    keyFile: "密钥文件",
    restoreProviderPreset: "恢复服务商预设",
    testConnection: "测试连接",
    testing: "测试中...",
    analysisRuntime: "分析运行时",
    autoRunQueuedJobs: "自动运行排队任务",
    requestTimeout: "请求超时 (ms)",
    maxConcurrency: "最大并发数",
    saving: "保存中...",
    saveSettings: "保存设置",
  },
  theme: {
    labels: {
      light: "亮色",
      dark: "暗色",
      system: "跟随系统",
    },
  },
  status: {
    labels: {
      queued: "排队中",
      in_progress: "进行中",
      completed: "已完成",
      failed: "失败",
    },
    idle: "空闲",
    inProgress: "进行中",
    readyToBegin: "准备开始",
    waiting: (phase) => (phase ? `等待中：${phase}` : "正在等待全局队列"),
    running: (phase) => (phase ? `运行中：${phase}` : "分析正在运行"),
    completed: "分析已完成",
    failed: "分析失败",
  },
};

const ja: WorkbenchCopy = {
  common: {
    workbench: "ワークベンチ",
    createNewProject: "新規プロジェクトを作成",
    projects: "プロジェクト",
    refresh: "更新",
    refreshing: "更新中...",
    noProjects: "プロジェクトはまだありません。",
    globalSettings: "グローバル設定",
    backToWorkbench: "ワークベンチに戻る",
    expandSidebar: "サイドバーを展開",
    collapseSidebar: "サイドバーを折りたたむ",
    themeTitle: (mode) => `${ja.theme.labels[mode]}テーマ`,
    useTheme: (mode) => `${ja.theme.labels[mode]}テーマを使用`,
    currentThemeSwitch: (mode) => `現在のテーマは${ja.theme.labels[mode]}です。クリックして切り替えます。`,
  },
  notices: {
    projectListRefreshed: "プロジェクト一覧を更新しました。",
    repositoryProjectCreated: "リポジトリプロジェクトを作成しました。",
    documentProjectCreated: "ドキュメントプロジェクトを作成しました。",
    analysisQueued: "解析ジョブをグローバルキューに追加しました。",
    analysisJobRemoved: "解析ジョブをグローバルキューから削除しました。",
    projectDeleted: "プロジェクトを削除しました。",
    queueReordered: "グローバル解析キューを並べ替えました。",
    settingsSaved: "設定を保存しました。",
    agentConnectionPassed: "Agent 接続テストに成功しました。",
    chooseAtLeastOneDocument: "ドキュメントを少なくとも1つ選択してください。",
  },
  overview: {
    title: "リポジトリとナレッジグラフのワークベンチ",
    description:
      "コード構造、モジュール関係、主要概念をローカルで解析し、探索可能なナレッジグラフを生成して、理解・検索・共同作業を効率化します。",
    exploreExisting: "既存プロジェクトを探索",
    toggleSidebar: "サイドバーを切り替え",
    illustrationRepository: "コードリポジトリ",
    illustrationGraph: "ナレッジグラフ",
    illustrationItems: [
      { title: "モジュール", subtitle: "Module" },
      { title: "クラス / インターフェース", subtitle: "Class / Interface" },
      { title: "関数 / メソッド", subtitle: "Function / Method" },
      { title: "依存関係", subtitle: "Dependency" },
      { title: "主要概念", subtitle: "Concept" },
    ],
    illustrationOutcomes: ["AI Q&A", "洞察分析", "チーム連携"],
  },
  create: {
    newProject: "新規プロジェクト",
    chooseSource: "ソースを選択",
    github: "GitHub",
    documents: "ドキュメント",
    publicGithubRepository: "公開 GitHub リポジトリ",
    projectName: "プロジェクト名",
    cloning: "クローン中...",
    importing: "インポート中...",
    createRepositoryProject: "リポジトリプロジェクトを作成",
    createDocumentProject: "ドキュメントプロジェクトを作成",
  },
  project: {
    repository: "リポジトリ",
    documents: "ドキュメント",
    deleteProject: "プロジェクトを削除",
    deleting: "削除中...",
    beginAnalysis: "解析を開始",
    starting: "開始中...",
    openGraph: "グラフを開く",
    graphNotReady: "グラフ未準備",
    graphNotReadyTitle: "ナレッジグラフを開くには解析を完了してください。",
    latestJob: "最新ジョブ",
    workerPhase: "Worker フェーズ",
    sourcePath: "ソースパス",
    graphPath: "グラフパス",
    none: "なし",
    idle: "待機中",
    analysisStatus: "解析ステータス",
    progress: "進捗",
    lastUpdate: "最終更新",
    notStarted: "未開始",
    currentJob: "現在のジョブ",
    log: "ログ",
    globalQueue: "グローバル解析キュー",
    total: (count) => `合計 ${count} 件`,
    noJobs: "キューに入っている解析ジョブはありません。",
    dragToReorder: "ドラッグして並べ替え",
    deleteAnalysisJob: "解析ジョブを削除",
    deleteAnalysisJobAria: (jobId) => `解析ジョブ ${jobId} を削除`,
    sourceDocuments: (count) => `${count} 件のドキュメント`,
    deleteProjectConfirm: (name) =>
      `OpenRepoCopilot から "${name}" を削除しますか？\n\nプロジェクト記録、解析ジョブ、生成済みグラフが削除されます。OpenRepoCopilot のプロジェクトディレクトリ外にあるソースファイルは保持されます。`,
  },
  settings: {
    globalSettings: "グローバル設定",
    runtimeConfiguration: "ランタイム設定",
    appearance: "外観",
    themeMode: "テーマモード",
    language: "言語",
    projectStorage: "プロジェクトストレージ",
    cloneRootPath: "プロジェクトのクローンルートパス",
    graphExportPath: "ナレッジグラフのエクスポートパス",
    agentProvider: "Agent / モデルプロバイダー",
    apiKeyNote: "API キーは環境変数またはローカルの agent.env ファイルからのみ読み取られます。",
    keyConfigured: "キー設定済み",
    keyMissing: "キー未設定",
    apiProvider: "API プロバイダー",
    model: "モデル",
    baseUrl: "Base URL",
    apiKeyEnv: "API キー環境変数",
    keyFile: "キーファイル",
    restoreProviderPreset: "プロバイダーのプリセットに戻す",
    testConnection: "接続をテスト",
    testing: "テスト中...",
    analysisRuntime: "解析ランタイム",
    autoRunQueuedJobs: "キュー内ジョブを自動実行",
    requestTimeout: "リクエストタイムアウト (ms)",
    maxConcurrency: "最大同時実行数",
    saving: "保存中...",
    saveSettings: "設定を保存",
  },
  theme: {
    labels: {
      light: "ライト",
      dark: "ダーク",
      system: "システム連動",
    },
  },
  status: {
    labels: {
      queued: "キュー待ち",
      in_progress: "進行中",
      completed: "完了",
      failed: "失敗",
    },
    idle: "待機中",
    inProgress: "進行中",
    readyToBegin: "開始準備完了",
    waiting: (phase) => (phase ? `待機中: ${phase}` : "グローバルキューで待機中"),
    running: (phase) => (phase ? `実行中: ${phase}` : "解析を実行中"),
    completed: "解析が完了しました",
    failed: "解析に失敗しました",
  },
};

const copies: Record<WorkbenchLanguage, WorkbenchCopy> = { zh, en, ja };

export function resolveWorkbenchLanguage(input: unknown): WorkbenchLanguage {
  return input === "zh" || input === "en" || input === "ja" ? input : "en";
}

export function workbenchText(language: unknown): WorkbenchCopy {
  return copies[resolveWorkbenchLanguage(language)];
}
