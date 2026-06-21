import { useEffect, useRef, useState, useCallback } from "react"
import {
  Send, Wrench, Bot, User, AlertCircle, Sparkles, Info, Zap, PlusSquare, RefreshCw,
  Settings, Globe, History, Edit2, Trash2, Check, X, Search, Coins,
  Brain, Database, Cpu, FileText, ChevronDown, ChevronUp, Loader2, Clock,
  Terminal as TermIcon, CheckCircle2, Activity
} from "lucide-react"
import { useChatStore } from "../stores/chatStore"
import { useProjectStore } from "../stores/projectStore"
import { useSettingsStore } from "../stores/settingsStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import { useAgentTraceStore } from "../stores/agentTraceStore"
import ActivityDropdown from "./ActivityDropdown"
import Markdown from "./Markdown"

// ── Helper: relative time ────────────────────────────────────────────────────
function formatRelativeTime(dateStr) {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHr  = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHr / 24)
    if (diffSec < 60)  return "Just now"
    if (diffMin < 60)  return `${diffMin}m ago`
    if (diffHr  < 24)  return `${diffHr}h ago`
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7)  return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  } catch {
    return ""
  }
}

// ── Quick-action prompt templates ────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "✍️  Write Docstrings",  prompt: "Add clear, concise docstrings to all public functions and classes in the open file." },
  { label: "🧪  Generate Tests",    prompt: "Write comprehensive pytest tests for the code in the open file, covering edge cases." },
  { label: "⚡  Refactor Code",     prompt: "Refactor the open file for better readability, performance, and maintainability." },
  { label: "🐞  Find Bugs",         prompt: "Carefully review the open file and identify any potential bugs, edge cases, or logic errors." },
  { label: "📋  Explain Code",      prompt: "Explain what the code in the open file does, step by step, in plain language." },
  { label: "🔒  Security Review",   prompt: "Review the open file for security vulnerabilities and suggest fixes." },
  { label: "📊  Check Performance", prompt: "Analyze the open file for any performance bottlenecks and suggest optimizations." },
  { label: "🔧  Fix Lint Errors",   prompt: "Fix all linting warnings and errors in the open file." },
]

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, onRetry, thoughtProcess }) {
  // Activity log card (agent tool trace)
  if (msg.role === "activity") {
    return <ActivityDropdown entries={msg.entries} isLive={false} />
  }

  const isUser   = msg.role === "user"
  const isTool   = msg.role === "tool_start" || msg.role === "tool_end"
  const isSystem = msg.role === "system"

  // ── Error cards ──────────────────────────────────────────────────────────────
  if (msg.role === "error") {
    const errorType = msg.error_type || "generic"

    if (errorType === "rate_limit") {
      return (
        <div className="flex flex-col gap-2.5 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-200 self-stretch my-2 shadow-[0_0_24px_rgba(249,115,22,0.08)] animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-bold text-orange-400">
            <Zap size={15} className="fill-orange-400 text-orange-400 animate-pulse" />
            <span>Rate Limit Exceeded</span>
          </div>
          <div className="text-[12.5px] leading-relaxed opacity-95">
            <Markdown text={msg.content} />
          </div>
          {onRetry && (
            <button onClick={() => {
                const msgs = useChatStore.getState().messages
                const lastUser = [...msgs].reverse().find(m => m.role === "user")
                if (lastUser) onRetry(lastUser.content)
              }}
              className="mt-1.5 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-300 text-xs font-semibold transition-all duration-200"
            >
              <RefreshCw size={11} />Retry Request
            </button>
          )}
        </div>
      )
    }

    if (errorType === "token_limit") {
      return (
        <div className="flex flex-col gap-2.5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 self-stretch my-2 shadow-[0_0_24px_rgba(245,158,11,0.08)] animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-bold text-amber-400">
            <AlertCircle size={15} className="text-amber-400 animate-pulse" />
            <span>Context Limit Exceeded</span>
          </div>
          <div className="text-[12.5px] leading-relaxed opacity-95">
            <Markdown text={msg.content} />
          </div>
          <div className="mt-1.5 border-t border-amber-500/20 pt-2 flex flex-col gap-1.5 text-[11px] text-amber-300/80">
            <span className="font-semibold text-amber-300 uppercase tracking-wider text-[9px]">Suggested Actions:</span>
            <span className="flex items-start gap-1"><span className="text-amber-400">•</span><span>Close open editor tabs that have large file sizes to reduce RAG context.</span></span>
            <span className="flex items-start gap-1"><span className="text-amber-400">•</span><span>Ask a shorter, more specific question.</span></span>
            <span className="flex items-start gap-1"><span className="text-amber-400">•</span><span>Select a model with a larger context window in the top dropdown.</span></span>
          </div>
        </div>
      )
    }

    if (errorType === "auth_error") {
      return (
        <div className="flex flex-col gap-2.5 p-4 rounded-xl bg-red-950/20 border border-red-500/30 text-red-200 self-stretch my-2 shadow-[0_0_24px_rgba(239,68,68,0.08)] animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-bold text-red-400">
            <AlertCircle size={15} className="text-red-400 animate-pulse" />
            <span>LLM Authentication Failure</span>
          </div>
          <div className="text-[12.5px] leading-relaxed opacity-95">
            <Markdown text={msg.content} />
          </div>
          <button
            onClick={() => useSettingsStore.getState().setSettingsOpen(true)}
            className="mt-1.5 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-xs font-semibold transition-all duration-200"
          >
            <Settings size={11} />Configure API Keys
          </button>
        </div>
      )
    }

    if (errorType === "network_error") {
      return (
        <div className="flex flex-col gap-2.5 p-4 rounded-xl bg-zinc-800/30 border border-zinc-500/30 text-zinc-300 self-stretch my-2 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-bold text-zinc-400">
            <Globe size={15} className="text-zinc-400 animate-pulse" />
            <span>Connection Timeout / Offline</span>
          </div>
          <div className="text-[12.5px] leading-relaxed opacity-95">
            <Markdown text={msg.content} />
          </div>
          {onRetry && (
            <button onClick={() => {
                const msgs = useChatStore.getState().messages
                const lastUser = [...msgs].reverse().find(m => m.role === "user")
                if (lastUser) onRetry(lastUser.content)
              }}
              className="mt-1.5 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-500/10 hover:bg-zinc-500/20 border border-zinc-500/25 text-zinc-300 text-xs font-semibold transition-all duration-200"
            >
              <RefreshCw size={11} />Retry Request
            </button>
          )}
        </div>
      )
    }

    // Generic error
    return (
      <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-red-950/10 border border-red-500/20 text-red-300 self-stretch my-2 shadow-sm animate-in fade-in duration-200">
        <div className="flex items-center gap-2 font-semibold text-red-400">
          <AlertCircle size={14} className="text-red-400 animate-pulse" />
          <span>Agent Execution Failure</span>
        </div>
        <div className="text-[12.5px] leading-relaxed opacity-90">
          <Markdown text={msg.content} />
        </div>
        {onRetry && (
          <button onClick={() => {
              const msgs = useChatStore.getState().messages
              const lastUser = [...msgs].reverse().find(m => m.role === "user")
              if (lastUser) onRetry(lastUser.content)
            }}
            className="mt-1 self-start flex items-center gap-1.5 px-3 py-1 rounded border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs transition-colors"
          >
            <RefreshCw size={12} />Retry
          </button>
        )}
      </div>
    )
  }

  // ── System notification bar ───────────────────────────────────────────────
  if (isSystem) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-editor-highlight/30 border border-editor-border/30 text-editor-muted text-[11px] self-stretch animate-in fade-in duration-200">
        <Info size={12} className="shrink-0 text-editor-muted/70" />
        <Markdown text={msg.content} />
      </div>
    )
  }

  // ── Standard message bubble ───────────────────────────────────────────────
  const icons = {
    user:       <User   size={14} className="text-white" />,
    assistant:  <Bot    size={14} className="text-editor-accent" />,
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
    <div className={`flex flex-col max-w-[92%] ${msg.role === "user" ? "self-end" : "self-start"}`}>
      {/* Thought process collapsible (assistant only, if prior activity exists) */}
      {msg.role === "assistant" && thoughtProcess && (
        <ThoughtProcess entries={thoughtProcess} />
      )}
      <div className={`flex items-start gap-3 px-3.5 py-2.5 rounded-2xl ${styles[msg.role] ?? styles.assistant} ${msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"} animate-in fade-in duration-200`}>
        {!isTool && (
          <div className={`mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full ${msg.role === "user" ? "bg-white/20" : "bg-editor-accent/10"}`}>
            {icons[msg.role]}
          </div>
        )}
        {isTool && <div className="mt-0.5 shrink-0">{icons[msg.role]}</div>}
        <div className="flex-1 min-w-0 text-[13px] leading-relaxed">
          <Markdown text={msg.content} />
        </div>
      </div>
    </div>
  )
}

// ── Animated Token Ticker ─────────────────────────────────────────────────────
function AnimatedTokenTicker({ messages }) {
  const total = messages.reduce((acc, msg) => {
    if (msg.role !== "activity" || !msg.entries) return acc
    return acc + msg.entries.reduce((a2, e) => {
      if (e.type === "lifecycle" && e.meta?.tokens?.total_tokens) return a2 + e.meta.tokens.total_tokens
      return a2
    }, 0)
  }, 0)

  const [displayed, setDisplayed] = useState(total)
  const prevRef = useRef(total)

  useEffect(() => {
    if (total === prevRef.current) return
    const start  = prevRef.current
    const end    = total
    const dur    = 600
    const t0     = performance.now()
    prevRef.current = total
    const tick = (now) => {
      const pct  = Math.min((now - t0) / dur, 1)
      // ease-out cubic
      const ease = 1 - (1 - pct) ** 3
      setDisplayed(Math.round(start + (end - start) * ease))
      if (pct < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [total])

  if (!total) return null
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full transition-all"
      style={{ background: "#ff9e6410", color: "#ff9e64aa", border: "1px solid #ff9e6425" }}
      title="Total tokens used this session"
    >
      <Coins size={9} />
      {displayed.toLocaleString()}
    </span>
  )
}

// ── Thinking Indicator with live tool context ─────────────────────────────────
const THINKING_STEPS = [
  { kind: "classify",    icon: Brain,    color: "#bb9af7", label: "Understanding query" },
  { kind: "context",     icon: Database, color: "#7dcfff", label: "Building context" },
  { kind: "llm_call",   icon: Cpu,      color: "#7aa2f7", label: "Streaming response" },
  { kind: "finalize",   icon: CheckCircle2, color: "#9ece6a", label: "Finalizing" },
  { kind: "tool",       icon: TermIcon, color: "#bb9af7", label: "Running tool" },
]

function ThinkingIndicator({ entries, isActive }) {
  if (!isActive) return null

  // Find the most recent running entry
  const running = [...entries].reverse().find(e => e.status === "running")
  let Icon  = Brain
  let color = "#7aa2f7"
  let label = "Agent thinking"

  if (running) {
    if (running.type === "lifecycle") {
      const meta = THINKING_STEPS.find(s => s.kind === running.kind)
      if (meta) { Icon = meta.icon; color = meta.color; label = running.label || meta.label }
    } else if (running.type === "tool") {
      Icon  = TermIcon
      color = "#bb9af7"
      const toolName = running.tool?.replace(/_/g, " ") ?? "Tool"
      label = toolName.charAt(0).toUpperCase() + toolName.slice(1)
    }
  }

  return (
    <div
      className="flex items-center gap-3 self-start px-4 py-3 rounded-2xl rounded-tl-sm max-w-[92%]
        border border-editor-border/40 shadow-sm animate-in fade-in duration-300"
      style={{
        background: `linear-gradient(135deg, ${color}08 0%, rgba(18,19,28,0.9) 100%)`,
        borderColor: color + "25",
      }}
    >
      {/* Animated icon */}
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: color + "15", border: `1px solid ${color}30` }}
      >
        <Loader2 size={13} className="animate-spin" style={{ color }} />
      </div>

      <div className="flex flex-col gap-0.5">
        {/* Step label */}
        <span
          className="text-[12px] font-semibold transition-all duration-500"
          style={{ color }}
        >
          {label}
        </span>
        {/* Animated dots */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1 h-1 rounded-full animate-pulse"
              style={{ background: color + "80", animationDelay: `${i * 180}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Token Budget Bar ──────────────────────────────────────────────────────────
const MODEL_CTX_MAP = {
  "gpt-4o": 128_000, "gpt-4-turbo": 128_000, "gpt-3.5-turbo": 16_385,
  "claude-3-5-sonnet": 200_000, "claude-3-opus": 200_000, "claude-sonnet-4-5": 200_000,
  "gemini-1.5-pro": 1_048_576, "gemini-1.5-flash": 1_048_576,
  "llama-3.3-70b-versatile": 128_000, "llama-3.1-8b-instant": 128_000,
  "mixtral-8x7b-32768": 32_768,
  default: 128_000,
}
function getCtx(model) {
  if (!model) return MODEL_CTX_MAP.default
  for (const [k, v] of Object.entries(MODEL_CTX_MAP)) {
    if (model.toLowerCase().includes(k)) return v
  }
  return MODEL_CTX_MAP.default
}

function TokenBudgetBar({ messages, model }) {
  const totalInput = messages.reduce((acc, msg) => {
    if (msg.role !== "activity" || !msg.entries) return acc
    return acc + msg.entries.reduce((a2, e) => {
      if (e.type === "lifecycle" && e.meta?.tokens?.input_tokens) return a2 + e.meta.tokens.input_tokens
      return a2
    }, 0)
  }, 0)
  if (!totalInput) return null
  const ctx  = getCtx(model)
  const pct  = Math.min(100, (totalInput / ctx) * 100)
  const color = pct < 60 ? "#9ece6a" : pct < 85 ? "#ff9e64" : "#f7768e"
  return (
    <div className="h-[3px] w-full bg-editor-highlight/30 shrink-0" title={`Context: ${pct.toFixed(1)}% of ${(ctx/1000).toFixed(0)}k tokens used`}>
      <div
        className="h-full transition-all duration-700"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}60, ${color})` }}
      />
    </div>
  )
}

// ── Thought Process Collapsible ───────────────────────────────────────────────
function ThoughtProcess({ entries }) {
  const [open, setOpen] = useState(false)
  if (!entries || entries.length === 0) return null

  const toolCalls = entries.filter(e => e.type === "tool")
  const lifecycle = entries.filter(e => e.type === "lifecycle")
  const totalTokens = lifecycle.reduce((acc, e) => {
    return acc + (e.meta?.tokens?.total_tokens ?? 0)
  }, 0)
  const totalMs = entries.reduce((acc, e) => acc + (e.durationMs ?? 0), 0)

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider
          text-editor-muted/60 hover:text-editor-muted/90 transition-colors px-1 py-0.5 rounded"
      >
        <Activity size={10} />
        <span>Thought process</span>
        {toolCalls.length > 0 && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-editor-highlight/40 text-editor-muted/70">
            {toolCalls.length} tool{toolCalls.length !== 1 ? "s" : ""}
          </span>
        )}
        {totalTokens > 0 && (
          <span className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-editor-highlight/40 text-editor-muted/70">
            <Coins size={8} />{totalTokens.toLocaleString()}
          </span>
        )}
        {totalMs > 0 && (
          <span className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-editor-highlight/40 text-editor-muted/70">
            <Clock size={8} />{totalMs < 1000 ? `${totalMs}ms` : `${(totalMs/1000).toFixed(1)}s`}
          </span>
        )}
        <span className="ml-auto">
          {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </span>
      </button>
      {open && (
        <div className="mt-1 pl-3 border-l border-editor-border/30 flex flex-col gap-1 animate-in fade-in duration-150">
          {entries.map((e, i) => {
            const isRunning = e.status === "running"
            const isDone    = e.status === "done"
            const isError   = e.status === "error"
            const label = e.type === "lifecycle"
              ? (e.label || e.kind)
              : (e.tool?.replace(/_/g, " ") ?? "Tool")
            const color = isError ? "#f7768e" : isDone ? "#9ece6a80" : "#7aa2f780"
            return (
              <div key={e.id || i} className="flex items-center gap-2 py-0.5">
                <div className="w-1 h-1 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[10px] text-editor-muted/70 truncate">{label}</span>
                {e.durationMs != null && (
                  <span className="ml-auto text-[9px] font-mono text-editor-muted/40 shrink-0">
                    {e.durationMs < 1000 ? `${e.durationMs}ms` : `${(e.durationMs/1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ChatPanel() {
  const project  = useProjectStore((s) => s.activeProject)
  const { messages, isStreaming, streamBuffer, isConnected } = useChatStore()
  const { sendMessage, connect }  = useAgentSocket(project?.id)
  const entries  = useAgentTraceStore((s) => s.entries)
  const isActive = useAgentTraceStore((s) => s.isActive)
  const input    = useChatStore((s) => s.input)
  const setInput = useChatStore((s) => s.setInput)
  const inputPulse = useChatStore((s) => s.inputPulse)
  const bottomRef    = useRef(null)
  const containerRef = useRef(null)

  // Chat History state
  const [showHistory,    setShowHistory]    = useState(false)
  const [searchQuery,    setSearchQuery]    = useState("")
  const [editingConvId,  setEditingConvId]  = useState(null)
  const [editTitle,      setEditTitle]      = useState("")
  const [deletingConvId, setDeletingConvId] = useState(null)

  const conversations      = useChatStore((s) => s.conversations)
  const conversationId     = useChatStore((s) => s.conversationId)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  const loadConversation   = useChatStore((s) => s.loadConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)

  useEffect(() => {
    if (project) fetchConversations(project.id)
  }, [project?.id, fetchConversations])

  useEffect(() => {
    if (project && conversationId && messages.length === 0) {
      loadConversation(project.id, conversationId)
    }
  }, [project?.id, conversationId, loadConversation, messages.length])

  useEffect(() => {
    const textarea = document.getElementById("chat-input-textarea")
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px"
    }
  }, [input])

  const provider = useSettingsStore((s) => s.provider)
  const model    = useSettingsStore((s) => s.model)
  const setModel = useSettingsStore((s) => s.setModel)

  const [modelCatalogue, setModelCatalogue] = useState({})
  useEffect(() => {
    import("../lib/api").then(({ default: api }) => {
      api.get("/api/settings/models").then(r => setModelCatalogue(r.data)).catch(() => {})
    })
  }, [])
  const availableModels = modelCatalogue[provider] || (model ? [model] : [])

  useEffect(() => {
    if (project) connect()
  }, [project?.id, connect])

  // Instant scroll while streaming
  useEffect(() => {
    const container = containerRef.current
    if (!container || !streamBuffer) return
    const threshold = 150
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold
    if (isNearBottom) container.scrollTop = container.scrollHeight
  }, [streamBuffer])

  // Smooth scroll on new messages
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
  }, [messages.length])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput("")
    sendMessage(text, model)
    const textarea = document.getElementById("chat-input-textarea")
    if (textarea) textarea.style.height = "auto"
  }

  const handleRetry = (text) => sendMessage(text, model)

  const filteredConversations = conversations.filter(conv =>
    (conv.title || "Untitled Conversation").toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full bg-editor-sidebar/95 backdrop-blur-xl border-l border-editor-border/50 shadow-[-8px_0_24px_rgba(0,0,0,0.2)] z-30 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-editor-border/50 bg-editor-bg/50 shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Sparkles size={14} className="text-editor-accent" />
        </div>
        <span className="text-[13px] font-bold text-white tracking-wide uppercase ml-1">AI Assistant</span>

        {/* Animated token ticker */}
        <AnimatedTokenTicker messages={messages} />

        <select
          className="ml-auto bg-editor-bg border border-editor-border text-[11px] text-editor-muted rounded px-2 py-0.5 outline-none hover:border-editor-accent/50 focus:border-editor-accent/80 transition-colors max-w-[120px] truncate cursor-pointer"
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

        {/* History Toggle */}
        <button
          onClick={() => {
            if (project) fetchConversations(project.id)
            setShowHistory(!showHistory)
          }}
          className={`ml-2 flex items-center justify-center w-7 h-7 rounded hover:bg-editor-highlight transition-all
            ${showHistory ? "bg-editor-accent/20 text-editor-accent border border-editor-accent/30" : "text-editor-muted hover:text-white"}`}
          title="Chat History"
        >
          <History size={14} />
        </button>

        {/* New Chat */}
        <button
          onClick={() => {
            useChatStore.getState().clearChat()
            useAgentTraceStore.getState().clear()
            setShowHistory(false)
          }}
          className="ml-1.5 flex items-center justify-center w-7 h-7 rounded hover:bg-editor-highlight text-editor-muted hover:text-white transition-all"
          title="New Chat"
        >
          <PlusSquare size={14} />
        </button>
      </div>

      {/* Token Budget Bar — thin progress bar below header */}
      <TokenBudgetBar messages={messages} model={model} />

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 scrollbar-thin"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 opacity-50">
            <Bot size={48} className="text-editor-muted mb-4" />
            <h3 className="text-white font-medium mb-1">How can I help?</h3>
            <p className="text-editor-muted text-xs max-w-[200px]">
              Ask me to write code, debug issues, or explore the codebase.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          // Attach the preceding activity block as thoughtProcess for assistant messages
          const prevMsg = idx > 0 ? messages[idx - 1] : null
          const thoughtProcess = (msg.role === "assistant" && prevMsg?.role === "activity")
            ? prevMsg.entries
            : null
          return (
            <MessageBubble key={msg.id} msg={msg} onRetry={handleRetry} thoughtProcess={thoughtProcess} />
          )
        })}

        {/* Live thinking indicator (shown when agent active) */}
        <ThinkingIndicator entries={entries} isActive={isActive} />

        {/* Live agent activity dropdown */}
        {isActive && entries.length > 0 && (
          <ActivityDropdown entries={entries} isLive={true} />
        )}

        {/* Streaming bubble */}
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

      {/* History Drawer */}
      {showHistory && (
        <div className="absolute inset-x-0 bottom-0 top-12 bg-[#12131a]/98 backdrop-blur-xl z-40 flex flex-col border-t border-editor-border/50 animate-in slide-in-from-left duration-200">
          <div className="p-3 border-b border-editor-border/30 flex gap-2 items-center bg-editor-sidebar">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-2.5 text-editor-muted" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1e1f29] border border-editor-border/60 focus:border-editor-accent/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-editor-muted outline-none transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2.5 text-editor-muted hover:text-white">
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-editor-highlight hover:bg-editor-highlight/80 text-white transition-colors border border-editor-border/50"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 scrollbar-thin">
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-editor-muted text-xs opacity-70">
                <History size={28} className="mb-2 opacity-50" />
                <span>No conversations found</span>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActiveConv = conv.id === conversationId
                const isEditing  = conv.id === editingConvId
                const isDeleting = conv.id === deletingConvId

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      if (!isEditing && !isDeleting) {
                        loadConversation(project.id, conv.id)
                        useAgentTraceStore.getState().clear()
                        setShowHistory(false)
                      }
                    }}
                    className={`group relative flex flex-col p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none
                      ${isActiveConv
                        ? "bg-editor-accent/10 border-editor-accent shadow-[0_0_16px_rgba(122,162,247,0.08)]"
                        : "bg-editor-bg/40 border-editor-border/40 hover:bg-editor-highlight/30 hover:border-editor-border/70"
                      }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 bg-[#1e1f29] border border-editor-accent rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-editor-accent"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editTitle.trim()) renameConversation(project.id, conv.id, editTitle.trim())
                              setEditingConvId(null)
                            } else if (e.key === "Escape") {
                              setEditingConvId(null)
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            if (editTitle.trim()) renameConversation(project.id, conv.id, editTitle.trim())
                            setEditingConvId(null)
                          }}
                          className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                          title="Save title"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingConvId(null)}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : isDeleting ? (
                      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-red-400 font-semibold animate-pulse">Delete conversation?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { deleteConversation(project.id, conv.id); setDeletingConvId(null) }}
                            className="px-3 py-1 text-[11px] font-bold bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/30 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeletingConvId(null)}
                            className="px-3 py-1 text-[11px] font-semibold bg-editor-highlight hover:bg-editor-highlight/80 text-white rounded-lg transition-colors border border-editor-border/40"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between pr-14">
                          <span className={`text-xs font-semibold truncate ${isActiveConv ? "text-white" : "text-editor-text/90 group-hover:text-white"}`}>
                            {conv.title || "Untitled Conversation"}
                          </span>
                        </div>
                        <span className="text-[10px] text-editor-muted mt-1.5 font-medium">
                          {formatRelativeTime(conv.created_at)}
                        </span>
                        <div
                          className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-editor-sidebar/85 backdrop-blur-md rounded-lg p-0.5 border border-editor-border/30"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => { setEditingConvId(conv.id); setEditTitle(conv.title || "") }}
                            className="p-1.5 text-editor-muted hover:text-white hover:bg-editor-highlight rounded-lg transition-colors"
                            title="Rename"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => setDeletingConvId(conv.id)}
                            className="p-1.5 text-editor-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Offline banner */}
      {!isConnected && (
        <div className="px-4 py-2 bg-red-950/40 border-t border-red-500/20 text-red-300 text-xs flex items-center justify-between animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 font-medium">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
            <span>Connection offline. Reconnecting in a few seconds...</span>
          </div>
          <button
            onClick={() => connect()}
            className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 font-medium transition-colors pointer-events-auto"
          >
            Retry Now
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-editor-border/50 bg-editor-bg/30 backdrop-blur-md">
        {messages.length === 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                disabled={isStreaming || !isConnected}
                onClick={() => {
                  setInput(action.prompt)
                  const textarea = document.getElementById("chat-input-textarea")
                  if (textarea) {
                    textarea.style.height = "auto"
                    textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px"
                    textarea.focus()
                  }
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-editor-border/50 bg-editor-highlight/30 hover:bg-editor-highlight/70 hover:border-editor-accent/40 text-editor-muted hover:text-white text-[11px] font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        <div className={`flex gap-2 items-end bg-editor-bg border border-editor-border hover:border-editor-accent/50 focus-within:border-editor-accent/80 focus-within:shadow-[0_0_15px_rgba(122,162,247,0.15)] rounded-xl px-3 py-2.5 transition-all ${inputPulse ? "animate-input-pulse border-editor-accent shadow-[0_0_25px_rgba(122,162,247,0.6)] scale-[1.02]" : ""} ${!isConnected ? "opacity-50 pointer-events-none" : ""}`}>
          <textarea
            id="chat-input-textarea"
            className="flex-1 bg-transparent text-white text-[13px] resize-none outline-none max-h-40 min-h-[20px] placeholder:text-editor-muted"
            placeholder={isConnected ? "Message the agent..." : "Agent is offline..."}
            rows={1}
            value={input}
            disabled={!isConnected}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = "auto"
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"
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
            disabled={isStreaming || !input.trim() || !isConnected}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-editor-accent hover:bg-editor-accentHover text-editor-bg disabled:bg-editor-highlight disabled:text-editor-muted transition-colors shrink-0 mb-0.5 shadow-md disabled:shadow-none"
          >
            <Send size={14} className={!isStreaming && input.trim() && isConnected ? "translate-x-px -translate-y-px" : ""} />
          </button>
        </div>
        <div className="flex justify-between items-center mt-2 px-1">
          <p className="text-[10px] text-editor-muted/70 font-medium">Use <kbd className="bg-editor-highlight px-1 rounded border border-editor-border">Shift+Enter</kbd> for newline</p>
        </div>
      </div>
    </div>
  )
}