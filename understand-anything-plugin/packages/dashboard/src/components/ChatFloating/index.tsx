// packages/dashboard/src/components/ChatFloating/index.tsx
import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "agent";
  content: string;
}

export default function ChatFloating() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 从 URL 获取当前项目 ID（与 App.tsx 保持一致）
  const projectId = new URLSearchParams(window.location.search).get("project") || "";

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // 调用后端 Agent 接口（后端需在 /api/agent/chat 实现）
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message: input,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "请求失败");
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: data.reply },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: `❌ 错误：${error instanceof Error ? error.message : "未知错误"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-black shadow-2xl shadow-accent/40 transition-transform hover:scale-105"
        aria-label="打开AI助手"
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* 聊天窗口 */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-glass-border-heavy bg-glass-bg-heavy shadow-2xl backdrop-blur-xl">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <span className="font-semibold text-text-primary">🤖 图谱助手</span>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              在线
            </span>
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-scrollbar-thumb">
            {messages.length === 0 ? (
              <div className="mt-10 text-center text-sm text-text-muted">
                你好！我是你的知识图谱助手。<br />
                可以问我关于当前代码库的任何问题。
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`mb-3 max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "ml-auto bg-accent text-black"
                      : "mr-auto bg-elevated text-text-primary"
                  }`}
                >
                  {msg.content}
                </div>
              ))
            )}
            {loading && (
              <div className="mr-auto max-w-[85%] rounded-2xl bg-elevated px-4 py-2 text-sm text-text-muted">
                正在思考…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入框 */}
          <div className="flex gap-2 border-t border-border-subtle p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="输入消息…"
              disabled={loading}
              className="flex-1 rounded-full border border-border-subtle bg-root px-4 py-2 text-sm text-text-primary outline-none transition focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-black transition hover:bg-accent-bright disabled:opacity-50"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </>
  );
}