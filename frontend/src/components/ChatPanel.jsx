import { useEffect, useRef, useState } from "react"
import { Send, Wrench, Bot, User, AlertCircle, Sparkles, Info, Zap, PlusSquare, RefreshCw, Settings, Globe, History, Edit2, Trash2, Check, X, Search, Coins } from "lucide-react"
import { useChatStore } from "../stores/chatStore"
import { useProjectStore } from "../stores/projectStore"
import { useSettingsStore } from "../stores/settingsStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import { useAgentTraceStore } from "../stores/agentTraceStore"
import ActivityDropdown from "./ActivityDropdown"
import Markdown from "./Markdown"

function formatRelativeTime(dateStr) {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHr = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHr / 24)

    if (diffSec < 60) return "Just now"
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch (e) {
    return ""
  }
}

// ── Token cost estimator ──────────────────────────────────────────────────────
const TOKEN_COSTS_PER_1K = {
  // Groq
  "llama-3.3-70b-versatile":  { input: 0.00059, output: 0.00079 },
  "llama-3.1-8b-instant":     { input: 0.00005, output: 0.00008 },
  "mixtral-8x7b-32768":       { input: 0.00024, output: 0.00024 },
  // OpenAI
  "gpt-4o":                   { input: 0.0025,  output: 0.01 },
  "gpt-4o-mini":              { input: 0.00015, output: 0.0006 },
  // Anthropic
  "claude-sonnet-4-5":        { input: 0.003,   output: 0.015 },
  "claude-3-haiku":           { input: 0.00025, output: 0.00125 },
  // Gemini
  "gemini-2.5-flash":         { input: 0.00015, output: 0.0006 },
  "gemini-1.5-pro":           { input: 0.00125, output: 0.005 },
  "gemini-1.5-flash":         { input: 0.000075,output: 0.0003 },
}

function estimateCost(tokenUsage) {
  if (!tokenUsage) return null
  const { input_tokens = 0, output_tokens = 0, total_tokens = 0, model = "" } = tokenUsage
  const rates = TOKEN_COSTS_PER_1K[model]
  if (!rates) {
    return { input_tokens, output_tokens, total_tokens, cost: null }
  }
  const cost = (input_tokens / 1000) * rates.input + (output_tokens / 1000) * rates.output
  return { input_tokens, output_tokens, total_tokens, cost }
}

function formatCost(cost) {
  if (cost === null || cost === undefined) return null
  if (cost < 0.0001) return "< $0.0001"
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

// ── Quick-action prompt templates ────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "✍️  Write Docstrings",   prompt: "Add clear, concise docstrings to all public functions and classes in the open file." },
  { label: "🧪  Generate Tests",     prompt: "Write comprehensive pytest tests for the code in the open file, covering edge cases." },
  { label: "⚡  Refactor Code",      prompt: "Refactor the open file for better readability, performance, and maintainability." },
  { label: "🐞  Find Bugs",          prompt: "Carefully review the open file and identify any potential bugs, edge cases, or logic errors." },
  { label: "📋  Explain Code",       prompt: "Explain what the code in the open file does, step by step, in plain language." },
  { label: "🔒  Security Review",    prompt: "Review the open file for security vulnerabilities and suggest fixes." },
  { label: "📊  Check Performance",  prompt: "Analyze the open file for any performance bottlenecks and suggest optimizations." },
  { label: "🔧  Fix Lint Errors",    prompt: "Fix all linting warnings and errors in the open file." },
]

function MessageBubble({ msg, onRetry }) {
  if (msg.role === "activity") {
    return <ActivityDropdown entries={msg.entries} isLive={false} />
  }
  const isUser   = msg.role === "user"
  const isTool   = msg.role === "tool_start" || msg.role === "tool_end"
  const isSystem = msg.role === "system"

  // Token usage badge (assistant only)
  const tokenInfo = msg.role === "assistant" ? estimateCost(msg.token_usage) : null

  // Actionable Error Cards
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
                const msgs = useChatStore.getState().messages;
                const lastUser = [...msgs].reverse().find(m => m.role === "user");
                if(lastUser) onRetry(lastUser.content);
              }} 
              className="mt-1.5 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-300 text-xs font-semibold transition-all duration-200"
            >
              <RefreshCw size={11} />
              Retry Request
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
            <span className="flex items-start gap-1">
              <span className="text-amber-400">•</span>
              <span>Close open editor tabs that have large file sizes to reduce RAG context.</span>
            </span>
            <span className="flex items-start gap-1">
              <span className="text-amber-400">•</span>
              <span>Ask a shorter, more specific question.</span>
            </span>
            <span className="flex items-start gap-1">
              <span className="text-amber-400">•</span>
              <span>Select a model with a larger context window in the top dropdown.</span>
            </span>
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
            <Settings size={11} />
            Configure API Keys
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
                const msgs = useChatStore.getState().messages;
                const lastUser = [...msgs].reverse().find(m => m.role === "user");
                if(lastUser) onRetry(lastUser.content);
              }} 
              className="mt-1.5 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-500/10 hover:bg-zinc-500/20 border border-zinc-500/25 text-zinc-300 text-xs font-semibold transition-all duration-200"
            >
              <RefreshCw size={11} />
              Retry Request
            </button>
          )}
        </div>
      )
    }

    // Generic / fallback error card
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
              const msgs = useChatStore.getState().messages;
              const lastUser = [...msgs].reverse().find(m => m.role === "user");
              if(lastUser) onRetry(lastUser.content);
            }} 
            className="mt-1 self-start flex items-center gap-1.5 px-3 py-1 rounded border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs transition-colors"
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
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-editor-highlight/30 border border-editor-border/30 text-editor-muted text-[11px] self-stretch animate-in fade-in duration-200">
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
    <div className={`flex items-start gap-3 px-3.5 py-2.5 rounded-2xl max-w-[92%] ${styles[msg.role] ?? styles.assistant} ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'} animate-in fade-in duration-200`}>
      {!isTool && (
        <div className={`mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full ${isUser ? 'bg-white/20' : 'bg-editor-accent/10'}`}>
          {icons[msg.role]}
        </div>
      )}
      {isTool && <div className="mt-0.5 shrink-0">{icons[msg.role]}</div>}
      <div className="flex-1 min-w-0 text-[13px] leading-relaxed">
        <Markdown text={msg.content} />
        {/* Token cost badge — only on completed assistant messages */}
        {tokenInfo && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400/80 text-[10px] font-mono">
              <Coins size={9} />
              <span>{tokenInfo.total_tokens.toLocaleString()} tokens</span>
            </div>
            {tokenInfo.cost !== null && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400/80 text-[10px] font-mono">
                <span>{formatCost(tokenInfo.cost)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const project   = useProjectStore((s) => s.activeProject)
  const { messages, isStreaming, streamBuffer, isConnected } = useChatStore()
  const { sendMessage, connect, disconnect } = useAgentSocket(project?.id)
  const entries   = useAgentTraceStore((s) => s.entries)
  const isActive  = useAgentTraceStore((s) => s.isActive)
  const input = useChatStore((s) => s.input)
  const setInput = useChatStore((s) => s.setInput)
  const inputPulse = useChatStore((s) => s.inputPulse)
  const bottomRef = useRef(null)
  const containerRef = useRef(null)

  // Chat History state
  const [showHistory, setShowHistory] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [editingConvId, setEditingConvId] = useState(null)
  const [editTitle, setEditTitle] = useState("")
  const [deletingConvId, setDeletingConvId] = useState(null)

  const conversations = useChatStore((s) => s.conversations)
  const conversationId = useChatStore((s) => s.conversationId)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  const loadConversation = useChatStore((s) => s.loadConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)

  // Fetch conversation lists when project changes
  useEffect(() => {
    if (project) {
      fetchConversations(project.id)
    }
  }, [project?.id, fetchConversations])

  // Load active conversation's messages from database on mount if messages is empty
  useEffect(() => {
    if (project && conversationId && messages.length === 0) {
      loadConversation(project.id, conversationId)
    }
  }, [project?.id, conversationId, loadConversation, messages.length])

  // Auto-resize input textarea when input changes programmatically (e.g. log injection)
  useEffect(() => {
    const textarea = document.getElementById("chat-input-textarea")
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px'
    }
  }, [input])

  // Pull provider + model from the global settings store
  const provider    = useSettingsStore((s) => s.provider)
  const model       = useSettingsStore((s) => s.model)
  const setModel    = useSettingsStore((s) => s.setModel)

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
  const cyclingWord = THINKING_WORDS[wordIndex]

  // Derived state: wait if run is active but we haven't started streaming tokens or executing tools
  const isWaiting = isActive && !isStreaming && !streamBuffer && entries.length === 0

  // Cycle words every 1.5 s while waiting
  useEffect(() => {
    if (!isWaiting) {
      setWordIndex(0)
      return
    }
    const id = setInterval(() => {
      setWordIndex((i) => (i + 1) % THINKING_WORDS.length)
    }, 1500)
    return () => clearInterval(id)
  }, [isWaiting])

  useEffect(() => {
    if (project) connect()
  }, [project?.id, connect])

  // Instant scroll on stream updates to avoid smooth animation queues/glitches
  useEffect(() => {
    const container = containerRef.current
    if (!container || !streamBuffer) return
    const threshold = 150
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight
    }
  }, [streamBuffer])

  // Smooth scroll on new message completions or user submissions
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth"
    })
  }, [messages.length])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput("")
    sendMessage(text, model)

    const textarea = document.getElementById("chat-input-textarea")
    if (textarea) {
        textarea.style.height = 'auto'
    }
  }

  const handleRetry = (text) => {
    sendMessage(text, model)
  }

  // Filter conversations by search query
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
        <span className="text-[13px] font-bold text-white tracking-wide uppercase ml-2">AI Assistant</span>
        
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

        {/* History Toggle Button */}
        <button
          onClick={() => {
            if (project) {
              fetchConversations(project.id)
            }
            setShowHistory(!showHistory)
          }}
          className={`ml-2 flex items-center justify-center w-7 h-7 rounded hover:bg-editor-highlight transition-all
            ${showHistory ? 'bg-editor-accent/20 text-editor-accent border border-editor-accent/30' : 'text-editor-muted hover:text-white'}`}
          title="Chat History"
        >
          <History size={14} />
        </button>

        {/* New Chat Button */}
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

      {/* Main Messages area */}
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

      {/* History Drawer Overlay */}
      {showHistory && (
        <div className="absolute inset-x-0 bottom-0 top-12 bg-[#12131a]/98 backdrop-blur-xl z-40 flex flex-col border-t border-editor-border/50 animate-in slide-in-from-left duration-200">
          {/* Search bar */}
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
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2.5 text-editor-muted hover:text-white"
                >
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

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 scrollbar-thin">
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-editor-muted text-xs opacity-70">
                <History size={28} className="mb-2 opacity-50" />
                <span>No conversations found</span>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = conv.id === conversationId
                const isEditing = conv.id === editingConvId
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
                      ${isActive 
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
                              if (editTitle.trim()) {
                                renameConversation(project.id, conv.id, editTitle.trim())
                              }
                              setEditingConvId(null)
                            } else if (e.key === "Escape") {
                              setEditingConvId(null)
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            if (editTitle.trim()) {
                              renameConversation(project.id, conv.id, editTitle.trim())
                            }
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
                            onClick={() => {
                              deleteConversation(project.id, conv.id)
                              setDeletingConvId(null)
                            }}
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
                          <span className={`text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-editor-text/90 group-hover:text-white'}`}>
                            {conv.title || "Untitled Conversation"}
                          </span>
                        </div>
                        <span className="text-[10px] text-editor-muted mt-1.5 font-medium">
                          {formatRelativeTime(conv.created_at)}
                        </span>

                        {/* Actions drawer triggers on hover */}
                        <div 
                          className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-editor-sidebar/85 backdrop-blur-md rounded-lg p-0.5 border border-editor-border/30"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setEditingConvId(conv.id)
                              setEditTitle(conv.title || "")
                            }}
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

      {/* Offline warning banner */}
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
        {/* Quick-Action Pills */}
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

        <div className={`flex gap-2 items-end bg-editor-bg border border-editor-border hover:border-editor-accent/50 focus-within:border-editor-accent/80 focus-within:shadow-[0_0_15px_rgba(122,162,247,0.15)] rounded-xl px-3 py-2.5 transition-all ${inputPulse ? 'animate-input-pulse border-editor-accent shadow-[0_0_25px_rgba(122,162,247,0.6)] scale-[1.02]' : ''} ${!isConnected ? 'opacity-50 pointer-events-none' : ''}`}>
          <textarea
            id="chat-input-textarea"
            className="flex-1 bg-transparent text-white text-[13px] resize-none outline-none max-h-40 min-h-[20px] placeholder:text-editor-muted"
            placeholder={isConnected ? "Message the agent..." : "Agent is offline..."}
            rows={1}
            value={input}
            disabled={!isConnected}
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