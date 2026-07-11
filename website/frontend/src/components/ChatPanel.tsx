import { ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
import { X } from "@phosphor-icons/react/X";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { api } from "../services/api";
import { pipelineApi, type ChatAnswer, type ChatCitation, type ChatMessage } from "../services/pipelineApi";
import "./ChatPanel.css";

// 前端降级开关：DISABLE_CHAT 演示时隐藏聊天入口（分工文档 T3 / 降级预案）
const CHAT_DISABLED = (import.meta.env.VITE_DISABLE_CHAT as string | undefined)?.toLowerCase() === "true";

const citationLabel: Record<ChatCitation["type"], string> = {
  risk: "风险",
  clause: "条款",
  case: "案例",
};

type PanelMessage = ChatMessage & { pending?: boolean; error?: boolean; mode?: ChatAnswer["mode"] };

const nowIso = () => new Date().toISOString();
const MIN_PANEL_WIDTH = 300;
const MIN_PANEL_HEIGHT = 360;

type ResizeState = {
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

export function ChatPanel({ taskId }: { taskId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<ResizeState | null>(null);

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
        { role: "assistant", content: answer.answer, citations: answer.citations, at: nowIso(), mode: answer.mode },
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

  const startResizeFromTopLeft = (event: PointerEvent<HTMLButtonElement>) => {
    const panel = event.currentTarget.parentElement;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resizeFromTopLeft = (event: PointerEvent<HTMLButtonElement>) => {
    const state = resizeRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const minWidth = Math.min(MIN_PANEL_WIDTH, Math.max(0, window.innerWidth - 32));
    const minHeight = Math.min(MIN_PANEL_HEIGHT, Math.max(0, window.innerHeight - 48));
    const maxWidth = Math.max(minWidth, window.innerWidth - 32);
    const maxHeight = Math.max(minHeight, window.innerHeight - 48);
    setPanelSize({
      width: Math.min(maxWidth, Math.max(minWidth, state.startWidth + state.startX - event.clientX)),
      height: Math.min(maxHeight, Math.max(minHeight, state.startHeight + state.startY - event.clientY)),
    });
  };

  const finishResizeFromTopLeft = (event: PointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
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
        <section
          className="mchat-panel"
          role="dialog"
          aria-label="合同助手对话"
          style={panelSize ? { width: `${panelSize.width}px`, height: `${panelSize.height}px` } : undefined}
        >
          <button
            type="button"
            className="mchat-resize-handle mchat-resize-handle--nw"
            aria-label="从左上角调整窗口大小"
            onPointerDown={startResizeFromTopLeft}
            onPointerMove={resizeFromTopLeft}
            onPointerUp={finishResizeFromTopLeft}
            onPointerCancel={finishResizeFromTopLeft}
          />
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
                {message.role === "assistant" && message.mode && (
                  <small className="mchat-source-note">
                    {message.mode === "llm" ? "依据当前报告，AI 辅助润色" : "依据当前报告和规则计算"}
                  </small>
                )}
                {message.citations && message.citations.length > 0 && (
                  <div className="mchat-citations">
                    {message.citations.map((citation) => (
                      <span key={`${citation.type}:${citation.id}`} className={`mchat-chip mchat-chip-${citation.type}`}>
                        {citationLabel[citation.type]}依据
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
              maxLength={500}
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
