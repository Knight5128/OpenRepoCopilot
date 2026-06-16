import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
} from "../types.js";

import { loadGraph } from "../persistence/index.js";
import { extractJson } from "./llm-analyzer.js";

/**
 * 图谱问答Agent入参
 */
export interface GraphChatInput {
  projectRoot: string;
  query: string;
  topK?: number;
  hop?: number;
}

/**
 * 返回结果
 */
export interface GraphChatResult {
  answer: string;
  relatedNodeIds: string[];

  rawGraphContext: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}

/**
 * 构造节点文本
 */
function buildNodeDocument(node: GraphNode): string {
  return [
    node.name,
    node.filePath,
    node.summary,
    node.tags?.join(" "),
    node.languageNotes ?? "",
    node.type,
    node.complexity ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * 中文分词
 * 不依赖第三方库
 */
function tokenize(text: string): string[] {
  const chinese = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];

  const english =
    text
      .toLowerCase()
      .match(/[a-zA-Z0-9_\-.]+/g) || [];

  return [...chinese, ...english];
}

/**
 * 节点打分
 */
function scoreNode(
  node: GraphNode,
  queryTokens: string[]
): number {
  const doc = buildNodeDocument(node);

  let score = 0;

  for (const token of queryTokens) {
    if (!token.trim()) continue;

    if (doc.includes(token)) {
      score += 1;
    }
  }

  // 类型加权
  switch (node.type) {
    case "function":
      score *= 1.2;
      break;

    case "class":
      score *= 1.1;
      break;

    case "file":
      score *= 1.05;
      break;
  }

  return score;
}

/**
 * 多跳扩散
 */
function expandGraph(
  graph: KnowledgeGraph,
  seedIds: Set<string>,
  hop: number
) {
  const nodeIds = new Set(seedIds);

  let frontier = new Set(seedIds);

  const selectedEdges: GraphEdge[] = [];

  for (let h = 0; h < hop; h++) {
    const next = new Set<string>();

    for (const edge of graph.edges) {
      if (
        frontier.has(edge.source) ||
        frontier.has(edge.target)
      ) {
        selectedEdges.push(edge);

        nodeIds.add(edge.source);
        nodeIds.add(edge.target);

        next.add(edge.source);
        next.add(edge.target);
      }
    }

    frontier = next;
  }

  const nodes = graph.nodes.filter((n) =>
    nodeIds.has(n.id)
  );

  return {
    nodes,
    edges: selectedEdges,
  };
}

/**
 * 图谱检索
 */
function retrieveRelevantGraph(
  graph: KnowledgeGraph,
  query: string,
  topK: number,
  hop: number
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const queryTokens = tokenize(query);

  const scoredNodes = graph.nodes
    .map((node) => ({
      node,
      score: scoreNode(node, queryTokens),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const seedIds = new Set(
    scoredNodes.map((x) => x.node.id)
  );

  return expandGraph(
    graph,
    seedIds,
    hop
  );
}

/**
 * 压缩节点上下文
 */
function buildNodeContext(
  nodes: GraphNode[]
): string {
  return nodes
    .map((node) => {
      return `
ID: ${node.id}
TYPE: ${node.type}
NAME: ${node.name}
PATH: ${node.filePath}

SUMMARY:
${node.summary}

TAGS:
${node.tags?.join(", ") || "无"}

COMPLEXITY:
${node.complexity || "unknown"}
      `.trim();
    })
    .join("\n\n----------------\n\n");
}

/**
 * 压缩关系上下文
 */
function buildEdgeContext(
  edges: GraphEdge[]
): string {
  return edges
    .slice(0, 200)
    .map(
      (e) =>
        `${e.source} --${e.type}--> ${e.target}`
    )
    .join("\n");
}

/**
 * Prompt
 */
function buildGraphChatPrompt(
  query: string,
  graphContext: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  },
  projectMeta: KnowledgeGraph["project"]
): string {
  const nodeText =
    buildNodeContext(graphContext.nodes);

  const edgeText =
    buildEdgeContext(graphContext.edges);

  return `
你是代码仓库知识图谱分析Agent。

严格遵守：

1. 只能依据提供的知识图谱回答
2. 不允许编造代码
3. 不允许推测不存在的函数
4. 图谱没有的信息直接说明
5. 尽量利用节点关系解释调用链

项目信息：

项目名：
${projectMeta.name}

项目描述：
${projectMeta.description}

开发语言：
${projectMeta.languages?.join(", ")}

框架：
${projectMeta.frameworks?.join(", ")}

==========================
核心节点
==========================

${nodeText}

==========================
节点关系
==========================

${edgeText}

==========================
用户问题
==========================

${query}

请返回JSON：

{
  "answer":"详细回答",
  "relatedNodeIds":[]
}

不要输出markdown。
不要输出代码块。
只返回JSON。
  `.trim();
}

/**
 * Agent入口
 */
export async function runGraphChatAgent(
  input: GraphChatInput,
  llmCall: (
    prompt: string
  ) => Promise<string>
): Promise<GraphChatResult> {
  const {
    projectRoot,
    query,
    topK = 15,
    hop = 2,
  } = input;

  const graph =
    loadGraph(projectRoot);

  if (!graph) {
    throw new Error(
      "未找到知识图谱，请先生成图谱"
    );
  }

  const graphContext =
    retrieveRelevantGraph(
      graph,
      query,
      topK,
      hop
    );

  const prompt =
    buildGraphChatPrompt(
      query,
      graphContext,
      graph.project
    );

  const llmResponse =
    await llmCall(prompt);

  let parsed: {
    answer: string;
    relatedNodeIds: string[];
  };

  try {
    const json =
      extractJson(llmResponse);

    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      "LLM返回结果无法解析：\n" +
        llmResponse
    );
  }

  return {
    answer:
      parsed.answer ||
      "未生成回答",

    relatedNodeIds:
      Array.isArray(
        parsed.relatedNodeIds
      )
        ? parsed.relatedNodeIds
        : [],

    rawGraphContext:
      graphContext,
  };
}