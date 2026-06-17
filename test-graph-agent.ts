// test.ts
import { runGraphChatAgent } from "./understand-anything-plugin/packages/core/src/analyzer/graph-chat";

/**
 * 模拟一个大模型 API 调用函数 (Mock LLM)
 * 在实际运行中，你需要把这里替换为调用 OpenAI、Ollama 或其他大模型接口的代码
 */
async function mockLlmCall(prompt: string): Promise<string> {
  console.log("=== 正在调用 LLM ===");
  console.log("生成的 Prompt 长度:", prompt.length);
  console.log("Prompt 预览 (前 300 字符):\n", prompt.substring(0, 300) + "...\n");

  // 模拟大模型严格按照要求返回 JSON 格式的数据
  const fakeResponse = {
    answer: "这是一个模拟回答：根据图谱信息，bot/__main__.py 是机器人的入口文件。它包含了 main 函数用于启动机器人，并调用了 _create_redis_session 来初始化 Redis 连接。",
    relatedNodeIds: [
      "file:bot/__main__.py",
      "function:bot/__main__.py:main",
      "function:bot/__main__.py:_create_redis_session"
    ]
  };

  return JSON.stringify(fakeResponse);
}

async function runTest() {
  console.log("=== 开始测试 Graph Agent ===\n");

  try {
    const result = await runGraphChatAgent(
      {
        // 确保你底层的 loadGraph(projectRoot) 能在这里找到 knowledge-graph.json
        projectRoot: "C:\\Users\\johnn\\PycharmProjects\\OpenRepoCopilot\\.openrepo-dev\\projects\\python-discord-bot",
        query: "请告诉我 bot/__main__.py 文件的主要作用，以及它调用了哪些核心函数？",
        topK: 5 // 检索 5 个核心节点，由于有 1-hop 扩展，实际传入的节点会更多
      },
      mockLlmCall
    );

    console.log("=== 测试成功，返回结果 ===");
    console.log("🤖 AI 回答:", result.answer);
    console.log("🔗 涉及的节点 IDs:", result.relatedNodeIds);
    console.log("📊 提取到的子图谱规模:");
    console.log(`   - 节点数: ${result.rawGraphContext.nodes.length}`);
    console.log(`   - 边数: ${result.rawGraphContext.edges.length}`);

  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error);
  }
}

// 执行测试
runTest();