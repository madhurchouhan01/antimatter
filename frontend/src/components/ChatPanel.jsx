import { useEffect, useRef, useState } from "react"
import { Send, Wrench, Bot, User, AlertCircle, Sparkles, Info, Zap, PlusSquare, RefreshCw, Settings } from "lucide-react"
import { useChatStore } from "../stores/chatStore"
import { useProjectStore } from "../stores/projectStore"
import { useSettingsStore } from "../stores/settingsStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import { useAgentTraceStore } from "../stores/agentTraceStore"
import ActivityDropdown from "./ActivityDropdown"
import Markdown from "./Markdown"

function MessageBubble({ msg, onRetry }) {
  if (msg.role === "activity") {
    return <ActivityDropdown entries={msg.entries} isLive={false} />
  }
  const isUser   = msg.role === "user"
  const isTool   = msg.role === "tool_start" || msg.role === "tool_end"
  const isSystem = msg.role === "system"

  // Rate limit error: highly visible block
  if (msg.role === "error" && msg.error_type === "rate_limit") {
    return (
      <div className="flex flex-col gap-2 p-4 rounded-xl bg-orange-500/20 border border-orange-500/50 text-orange-200 self-stretch my-2 shadow-[0_0_20px_rgba(249,115,22,0.15)]">
        <div className="flex items-center gap-2 font-bold text-orange-400">
          <Zap size={16} className="fill-orange-400" />
          <span>Rate Limit Exceeded</span>
        </div>
        <div className="text-[13px] leading-relaxed">
          <Markdown text={msg.content} />
        </div>
        {onRetry && (
          <button onClick={() => {
              const msgs = useChatStore.getState().messages;
              const lastUser = [...msgs].reverse().find(m => m.role === "user");
              if(lastUser) onRetry(lastUser.content);
            }} 
            className="mt-2 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/40 text-orange-300 text-xs font-medium transition-colors border border-orange-500/30"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        )}
      </div>
    )
  }

  // Generic error
  if (msg.role === "error") {
      return (
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-red-900/20 border border-red-500/30 text-red-300 self-stretch my-2 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-red-400">
            <AlertCircle size={14} className="text-red-400" />
            <span>Agent Error</span>
          </div>
          <div className="text-[12px] leading-relaxed opacity-90">
             <Markdown text={msg.content} />
          </div>
          {onRetry && (
            <button onClick={() => {
                const msgs = useChatStore.getState().messages;
                const lastUser = [...msgs].reverse().find(m => m.role === "user");
                if(lastUser) onRetry(lastUser.content);
              }} 
              className="mt-1 self-start flex items-center gap-1.5 px-3 py-1 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs transition-colors"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          )}
        </div>
      )
  }

  // System messages: slim horizontal notification bar, not a bubble
  if (isSystem) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-editor-highlight/30 border border-editor-border/30 text-editor-muted text-[11px] self-stretch">
        <Info size={12} className="shrink-0 text-editor-muted/70" />
        <Markdown text={msg.content} />
      </div>
    )
  }

  const icons = {
    user:       <User size={14} className="text-white" />,
    assistant:  <Bot  size={14} className="text-editor-accent" />,
    tool_start: <Wrench size={12} className="text-yellow-400" />,
    tool_end:   <Wrench size={12} className="text-green-400" />,
    error:      <AlertCircle size={14} className="text-red-400" />,
  }

  const styles = {
    user:       "bg-gradient-to-br from-blue-600 to-indigo-600 text-white self-end shadow-lg shadow-blue-500/20 border border-blue-500/20",
    assistant:  "bg-editor-highlight/50 backdrop-blur-md text-editor-text self-start border border-editor-border/50 shadow-sm",
    tool_start: "bg-transparent border border-editor-border/30 text-editor-muted self-start text-[11px] opacity-70",
    tool_end:   "bg-transparent border border-editor-border/30 text-editor-muted self-start text-[11px] opacity-70",
    error:      "bg-red-900/20 border border-red-500/30 text-red-300 self-start shadow-sm",
  }

  return (
    <div className={`flex items-start gap-3 px-3.5 py-2.5 rounded-2xl max-w-[92%] ${styles[msg.role] ?? styles.assistant} ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
      {!isTool && (
        <div className={`mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full ${isUser ? 'bg-white/20' : 'bg-editor-accent/10'}`}>
          {icons[msg.role]}
        </div>
      )}
      {isTool && <div className="mt-0.5 shrink-0">{icons[msg.role]}</div>}
      <div className="flex-1 min-w-0 text-[13px] leading-relaxed">
        <Markdown text={msg.content} />
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const project   = useProjectStore((s) => s.activeProject)
  const { messages, isStreaming, streamBuffer } = useChatStore()
  const { sendMessage, connect, disconnect } = useAgentSocket(project?.id)
  const entries   = useAgentTraceStore((s) => s.entries)
  const isActive  = useAgentTraceStore((s) => s.isActive)
  const [input, setInput] = useState("")
  const bottomRef = useRef(null)

  // Pull provider + model from the global settings store
  const provider    = useSettingsStore((s) => s.provider)
  const model       = useSettingsStore((s) => s.model)
  const setModel    = useSettingsStore((s) => s.setModel)
  const providerModels = useSettingsStore((s) => s.providerModels) || []

  // Curated model lists per provider (loaded separately from backend)
  const [modelCatalogue, setModelCatalogue] = useState({})
  useEffect(() => {
    import("../lib/api").then(({ default: api }) => {
      api.get("/api/settings/models").then(r => setModelCatalogue(r.data)).catch(() => {})
    })
  }, [])
  const availableModels = modelCatalogue[provider] || (model ? [model] : [])

  const THINKING_WORDS = [
    "reasoning", "deducing", "inducing", "extrapolating",
    "analyzing", "synthesizing", "categorizing", "deciphering",
    "assessing", "verifying", "postulating", "thinking", "working"
  ]
  const [wordIndex, setWordIndex] = useState(0)
  const [isWaiting, setIsWaiting] = useState(false)
  const cyclingWord = THINKING_WORDS[wordIndex]

  // Stop waiting once the agent sends its first real response
  useEffect(() => {
    if (!isStreaming && isWaiting) {
      setIsWaiting(false)
      setWordIndex(0)
    }
  }, [isStreaming])

  // Cycle words every 1.5 s while waiting
  useEffect(() => {
    if (!isWaiting) return
    const id = setInterval(() => {
      setWordIndex((i) => (i + 1) % THINKING_WORDS.length)
    }, 1500)
    return () => clearInterval(id)
  }, [isWaiting])

  useEffect(() => {
    if (project) connect()
  }, [project?.id, connect])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamBuffer])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput("")
    setIsWaiting(true)
    setWordIndex(0)
    sendMessage(text, model)

    const textarea = document.getElementById("chat-input-textarea")
    if (textarea) {
        textarea.style.height = 'auto'
    }
  }

  const handleRetry = (text) => {
    sendMessage(text, model)
  }

  return (
    <div className="flex flex-col h-full bg-editor-sidebar/95 backdrop-blur-xl border-l border-editor-border/50 shadow-[-8px_0_24px_rgba(0,0,0,0.2)] z-30 relative">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 h-12 border-b border-editor-border/50 bg-editor-bg/50 shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Sparkles size={14} className="text-editor-accent" />
        </div>
        <span className="text-[13px] font-bold text-white tracking-wide uppercase">AI Assistant</span>
        
        <select 
          className="ml-auto bg-editor-bg border border-editor-border text-[11px] text-editor-muted rounded px-2 py-0.5 outline-none hover:border-editor-accent/50 focus:border-editor-accent/80 transition-colors max-w-[140px] truncate cursor-pointer"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {availableModels.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
          {model && !availableModels.includes(model) && (
            <option value={model}>{model}</option>
          )}
        </select>


        <button
          onClick={() => {
            useChatStore.getState().clearChat()
            useAgentTraceStore.getState().clear()
          }}
          className="ml-2 flex items-center justify-center w-6 h-6 rounded hover:bg-editor-highlight text-editor-muted hover:text-white transition-colors"
          title="New Chat"
        >
          <PlusSquare size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 opacity-50">
            <Bot size={48} className="text-editor-muted mb-4" />
            <h3 className="text-white font-medium mb-1">How can I help?</h3>
            <p className="text-editor-muted text-xs max-w-[200px]">
              Ask me to write code, debug issues, or explore the codebase.
            </p>
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} onRetry={handleRetry} />)}
        
        {/* Live agent activity dropdown during active run */}
        {isActive && entries.length > 0 && (
          <ActivityDropdown entries={entries} isLive={true} />
        )}
        
        {/* ── Thinking shimmer — premium cycling word card ── */}
        {isWaiting && entries.length === 0 && !streamBuffer && !isStreaming && (
          <div className="self-start max-w-[92%] relative">
            {/* Ambient drifting glow behind the card */}
            <div
              className="orb-drift absolute -inset-3 rounded-3xl pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at 40% 50%, rgba(122,162,247,0.18) 0%, rgba(187,154,247,0.1) 50%, transparent 75%)",
                filter: "blur(12px)",
              }}
            />

            {/* Card */}
            <div
              className="relative overflow-hidden rounded-2xl rounded-tl-sm px-4 py-3.5"
              style={{
                background: "linear-gradient(135deg, rgba(26,27,38,0.95) 0%, rgba(36,40,59,0.9) 100%)",
                border: "1px solid rgba(122,162,247,0.18)",
                boxShadow: "0 0 0 1px rgba(122,162,247,0.06) inset, 0 8px 32px rgba(0,0,0,0.3)",
                backdropFilter: "blur(20px)",
              }}
            >
              {/* Inner shimmer layer */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(105deg, transparent 40%, rgba(122,162,247,0.04) 50%, transparent 60%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmerSweep 3s linear infinite",
                }}
              />

              <div className="relative flex items-center gap-3">
                {/* Pulsing icon ring */}
                <div className="relative shrink-0">
                  <div
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: "rgba(122,162,247,0.15)", animationDuration: "2s" }}
                  />
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, rgba(122,162,247,0.2), rgba(187,154,247,0.15))",
                      border: "1px solid rgba(122,162,247,0.3)",
                    }}
                  >
                    <Bot size={13} className="text-editor-accent" />
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  {/* Cycling word */}
                  <span
                    key={cyclingWord}
                    className="word-slide-up text-[13px] font-semibold tracking-wide"
                    style={{
                      background: "linear-gradient(90deg, #7aa2f7, #bb9af7, #7dcfff)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {cyclingWord}…
                  </span>

                  {/* Skeleton bars with shimmer sweep */}
                  <div className="flex flex-col gap-1.5">
                    <div className="skeleton-bar h-2" style={{ width: "72%" }} />
                    <div className="skeleton-bar h-2" style={{ width: "48%", animationDelay: "0.3s" }} />
                  </div>
                </div>
              </div>

              {/* Dot pulse row */}
              <div className="flex gap-1 mt-3 ml-10">
                {[0, 180, 360].map((delay) => (
                  <span
                    key={delay}
                    className="w-1 h-1 rounded-full animate-bounce"
                    style={{
                      background: "rgba(122,162,247,0.6)",
                      animationDelay: `${delay}ms`,
                      animationDuration: "1.2s",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Streaming content: shown once first token arrives */}
        {streamBuffer && (
          <div className="flex items-start gap-3 px-3.5 py-2.5 rounded-2xl rounded-tl-sm max-w-[92%] bg-editor-highlight/50 backdrop-blur-md text-editor-text self-start border border-editor-border/50 shadow-sm">
            <div className="mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-editor-accent/10">
              <Bot size={14} className="text-editor-accent" />
            </div>
            <div className="flex-1 min-w-0 text-[13px] leading-relaxed">
              <Markdown text={streamBuffer} />
              <span className="animate-pulse inline-block ml-1 text-editor-accent font-bold">▋</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-2 shrink-0" />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-editor-border/50 bg-editor-bg/30 backdrop-blur-md">
        <div className="flex gap-2 items-end bg-editor-bg border border-editor-border hover:border-editor-accent/50 focus-within:border-editor-accent/80 focus-within:shadow-[0_0_15px_rgba(122,162,247,0.15)] rounded-xl px-3 py-2.5 transition-all">
          <textarea
            id="chat-input-textarea"
            className="flex-1 bg-transparent text-white text-[13px] resize-none outline-none max-h-40 min-h-[20px] placeholder:text-editor-muted"
            placeholder="Message the agent..."
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-editor-accent hover:bg-editor-accentHover text-editor-bg disabled:bg-editor-highlight disabled:text-editor-muted transition-colors shrink-0 mb-0.5 shadow-md disabled:shadow-none"
          >
            <Send size={14} className={!isStreaming && input.trim() ? "translate-x-px -translate-y-px" : ""} />
          </button>
        </div>
        <div className="flex justify-between items-center mt-2 px-1">
          <p className="text-[10px] text-editor-muted/70 font-medium">Use <kbd className="bg-editor-highlight px-1 rounded border border-editor-border">Shift+Enter</kbd> for newline</p>
        </div>
      </div>
    </div>
  )
}