import { ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
import { X } from "@phosphor-icons/react/X";
import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { pipelineApi, type ChatCitation, type ChatMessage } from "../services/pipelineApi";
import "./ChatPanel.css";

// 前端降级开关：DISABLE_CHAT 演示时隐藏聊天入口（分工文档 T3 / 降级预案）
const CHAT_DISABLED = (import.meta.env.VITE_DISABLE_CHAT as string | undefined)?.toLowerCase() === "true";

const citationLabel: Record<ChatCitation["type"], string> = {
  risk: "风险",
  clause: "条款",
  case: "案例",
};

type PanelMessage = ChatMessage & { pending?: boolean; error?: boolean };

const nowIso = () => new Date().toISOString();

export function ChatPanel({ taskId }: { taskId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 真实任务才有后端报告可问；mock 模式或缺 taskId 时不展示入口
  const available = Boolean(taskId) && !CHAT_DISABLED && !api.isMockPipelineEnabled();

  useEffect(() => {
    if (!open || !taskId) return;
    let cancelled = false;
    pipelineApi
      .getChatHistory(taskId)
      .then((res) => {
        if (!cancelled && res.messages.length > 0) setMessages(res.messages);
      })
      .catch(() => {
        /* 历史拉取失败不影响新对话 */
      });
    return () => {
      cancelled = true;
    };
  }, [open, taskId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  if (!available) return null;

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending || !taskId) return;
    setInput("");
    setSuggestions([]);
    setMessages((prev) => [...prev, { role: "user", content: question, at: nowIso() }]);
    setSending(true);
    try {
      const answer = await pipelineApi.sendChat(taskId, question);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer.answer, citations: answer.citations, at: nowIso() },
      ]);
      setSuggestions(answer.suggestedQuestions ?? []);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "回答失败，请稍后再试。",
          at: nowIso(),
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {!open && (
        <button type="button" className="mchat-launcher" onClick={() => setOpen(true)} aria-label="打开合同助手">
          <ChatCircle size={24} weight="fill" />
          <span>问一问</span>
        </button>
      )}

      {open && (
        <section className="mchat-panel" role="dialog" aria-label="合同助手对话">
          <header className="mchat-header">
            <div className="mchat-title">
              <ChatCircle size={20} weight="duotone" />
              <span>合同助手</span>
            </div>
            <button type="button" className="mchat-close" onClick={() => setOpen(false)} aria-label="关闭">
              <X size={18} weight="bold" />
            </button>
          </header>

          <div className="mchat-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="mchat-empty">
                <p>我可以基于你这份报告回答问题，比如：</p>
                <div className="mchat-suggestions">
                  {["为什么这个风险高？", "我的服务费有什么问题？", "真实年化利率是多少？"].map((q) => (
                    <button key={q} type="button" onClick={() => void send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div key={`${message.at}-${index}`} className={`mchat-bubble mchat-${message.role}${message.error ? " mchat-error" : ""}`}>
                {message.content.split("\n").map((line, lineIndex) => (
                  <p key={lineIndex}>{line}</p>
                ))}
                {message.citations && message.citations.length > 0 && (
                  <div className="mchat-citations">
                    {message.citations.map((citation) => (
                      <span key={`${citation.type}:${citation.id}`} className={`mchat-chip mchat-chip-${citation.type}`}>
                        {citationLabel[citation.type]} · {citation.id}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="mchat-bubble mchat-assistant mchat-typing">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          {suggestions.length > 0 && !sending && (
            <div className="mchat-followups">
              {suggestions.map((q) => (
                <button key={q} type="button" onClick={() => void send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}

          <form
            className="mchat-input"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              type="text"
              value={input}
              placeholder="问问这份合同的风险、成本或还款…"
              onChange={(event) => setInput(event.target.value)}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()} aria-label="发送">
              <PaperPlaneRight size={18} weight="fill" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
