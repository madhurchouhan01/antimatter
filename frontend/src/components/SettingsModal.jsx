import { useState, useEffect, useCallback } from "react"
import {
  X, Settings, Key, ChevronDown, Eye, EyeOff, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Cpu, Sparkles, Shield,
  Zap, Shuffle, Brain, Trash2, Copy, Check, Server, RefreshCw,
  AlertTriangle, WifiOff
} from "lucide-react"
import { useSettingsStore } from "../stores/settingsStore"
import { useProjectStore } from "../stores/projectStore"
import api, { memoriesApi } from "../lib/api"

// Custom SVG component for GitHub
const GitHubIcon = ({ size = 16, className = "", style = {} }) => (
  <svg viewBox="0 0 24 24" className={className} style={{ width: size, height: size, fill: "currentColor", ...style }} xmlns="http://www.w3.org/2000/svg">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
)

// Custom SVG component for OpenAI/ChatGPT
const OpenAILogo = ({ size = 16, className = "", style = {} }) => (
  <svg viewBox="0 0 16 16" className={className} style={{ width: size, height: size, fill: "currentColor", ...style }} xmlns="http://www.w3.org/2000/svg">
    <path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934A4.1 4.1 0 0 0 8.423.2 4.15 4.15 0 0 0 6.305.086a4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679A4 4 0 0 0 .554 4.72a3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.208-.035L8.7 2.08a.53.53 0 0 0-.272.449v4.494L7.062 6.245q-.02-.011-.025-.035V2.488a3.04 3.04 0 0 1 1.5-2.613c.472-.271.996-.421 1.531-.439a3.06 3.06 0 0 1 1.943.69z"/>
  </svg>
)

// Custom SVG component for Claude (Anthropic logo/symbol)
const ClaudeLogo = ({ size = 16, className = "", style = {} }) => (
  <svg viewBox="0 0 24 24" className={className} style={{ width: size, height: size, fill: "currentColor", ...style }} xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3c-.55 0-1 .45-1 1v4.27l-3.02-3.02a.996.996 0 1 0-1.41 1.41L9.59 9.68l-4.27 1.15a1 1 0 1 0 .52 1.93l4.27-1.15-2.07 3.58a1 1 0 1 0 1.73 1l2.07-3.58V19c0 .55.45 1 1 1s1-.45 1-1v-6.38l2.07 3.58a1 1 0 0 0 1.73-1l-2.07-3.58 4.27 1.15c.09.02.17.03.26.03a1 1 0 0 0 .26-1.96l-4.27-1.15 3.02-3.02a.996.996 0 1 0-1.41-1.41L13 8.27V4c0-.55-.45-1-1-1z" />
  </svg>
)

// Custom SVG component for Google Gemini (4-point curved star)
const GeminiLogo = ({ size = 16, className = "", style = {} }) => (
  <svg viewBox="0 0 24 24" className={className} style={{ width: size, height: size, fill: "currentColor", ...style }} xmlns="http://www.w3.org/2000/svg">
    <path d="M22 12c-5.52 0-10-4.48-10-10c0 5.52-4.48 10-10 10c5.52 0 10 4.48 10 10c0-5.52 4.48-10 10-10z" />
  </svg>
)

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = {
  groq: {
    label: "Groq",
    icon: Zap,
    color: "#f97316",
    gradient: "from-orange-500/20 to-red-500/10",
    border: "border-orange-500/30",
    description: "Ultra-fast inference via Groq Cloud",
    docsUrl: "https://console.groq.com/keys",
    docsLabel: "Get Groq API Key →",
    keyPlaceholder: "gsk_...",
    defaultModel: "llama-3.3-70b-versatile",
  },
  github: {
    label: "GitHub Marketplace",
    icon: GitHubIcon,
    color: "#a78bfa",
    gradient: "from-violet-500/20 to-purple-500/10",
    border: "border-violet-500/30",
    description: "GitHub Models via Azure AI Inference",
    docsUrl: "https://github.com/settings/tokens",
    docsLabel: "Create a GitHub PAT →",
    keyPlaceholder: "ghp_... or github_pat_...",
    defaultModel: "openai/gpt-4.1",
  },
  openai: {
    label: "OpenAI",
    icon: OpenAILogo,
    color: "#10a37f",
    gradient: "from-emerald-500/20 to-teal-500/10",
    border: "border-emerald-500/30",
    description: "GPT-4o, o3, and the latest OpenAI models",
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "Get OpenAI API Key →",
    keyPlaceholder: "sk-...",
    defaultModel: "gpt-4o",
  },
  openrouter: {
    label: "OpenRouter",
    icon: Shuffle,
    color: "#6366f1",
    gradient: "from-indigo-500/20 to-blue-500/10",
    border: "border-indigo-500/30",
    description: "Unified access to 100+ models",
    docsUrl: "https://openrouter.ai/keys",
    docsLabel: "Get OpenRouter Key →",
    keyPlaceholder: "sk-or-...",
    defaultModel: "openai/gpt-4o",
  },
  anthropic: {
    label: "Anthropic",
    icon: ClaudeLogo,
    color: "#d97706",
    gradient: "from-amber-500/20 to-yellow-500/10",
    border: "border-amber-500/30",
    description: "Claude — world-class reasoning",
    docsUrl: "https://console.anthropic.com/keys",
    docsLabel: "Get Anthropic API Key →",
    keyPlaceholder: "sk-ant-...",
    defaultModel: "claude-sonnet-4-5",
  },
  gemini: {
    label: "Google Gemini",
    icon: GeminiLogo,
    color: "#3b82f6",
    gradient: "from-blue-500/20 to-cyan-500/10",
    border: "border-blue-500/30",
    description: "Gemini 2.5 Pro & Flash via Google AI",
    docsUrl: "https://aistudio.google.com/apikey",
    docsLabel: "Get Gemini API Key →",
    keyPlaceholder: "AIza...",
    defaultModel: "gemini-2.5-flash",
  },
  ollama: {
    label: "Ollama",
    icon: Server,
    color: "#22d3ee",
    gradient: "from-cyan-500/20 to-teal-500/10",
    border: "border-cyan-500/30",
    description: "Local open-source models on your hardware",
    docsUrl: "https://ollama.com/library",
    docsLabel: "Browse Ollama Models →",
    keyPlaceholder: "",
    defaultModel: "qwen2.5-coder:7b",
    isLocal: true,
  },
}

export default function SettingsModal({ onClose }) {
  const {
    provider: savedProvider,
    model: savedModel,
    hasApiKey,
    isSaving,
    error,
    fetchSettings,
    saveSettings,
  } = useSettingsStore()

  const activeProject = useProjectStore((s) => s.activeProject)

  const [activeTab, setActiveTab] = useState("provider")  // "provider" | "memories"

  // Provider settings state
  const [provider, setProvider]       = useState(savedProvider)
  const [model,    setModel]          = useState(savedModel)
  const [apiKey,   setApiKey]         = useState("")
  const [showKey,  setShowKey]        = useState(false)
  const [clearKey, setClearKey]       = useState(false)
  const [providerModels, setProviderModels] = useState({})
  const [customModel, setCustomModel] = useState("")
  const [useCustom, setUseCustom]     = useState(false)
  const [saveOk,   setSaveOk]         = useState(false)

  // Ollama-specific state
  const [ollamaBaseUrl,    setOllamaBaseUrl]    = useState("http://localhost:11434/v1")
  const [ollamaInstalled,  setOllamaInstalled]  = useState([])   // models actually pulled
  const [ollamaRecommended,setOllamaRecommended]= useState([])   // curated but not installed
  const [ollamaFetching,   setOllamaFetching]   = useState(false)
  const [ollamaReachable,  setOllamaReachable]  = useState(null) // null | true | false
  const [ollamaError,      setOllamaError]      = useState(null) // error message string

  // Memories state
  const [memories, setMemories]       = useState([])
  const [memLoading, setMemLoading]   = useState(false)
  const [deletingId, setDeletingId]   = useState(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const meta = PROVIDERS[provider] || PROVIDERS.groq

  // Load provider→model catalogue from backend
  useEffect(() => {
    api.get("/api/settings/models").then(res => setProviderModels(res.data)).catch(() => {})
  }, [])

  // Auto-fetch Ollama models when switching to Ollama provider
  const fetchOllamaModels = useCallback(async (url) => {
    setOllamaFetching(true)
    setOllamaReachable(null)
    setOllamaError(null)
    try {
      const params = url ? `?base_url=${encodeURIComponent(url)}` : ""
      const res = await api.get(`/api/settings/ollama/models${params}`)
      const data = res.data
      setOllamaReachable(data.reachable)
      setOllamaInstalled(data.installed || [])
      setOllamaRecommended(data.recommended || [])
      setOllamaError(data.error || null)
      // Auto-select first installed model if current model not in installed list
      if (data.reachable && data.installed?.length > 0 && !data.installed.includes(model)) {
        setModel(data.installed[0])
      }
    } catch (err) {
      setOllamaReachable(false)
      setOllamaInstalled([])
      setOllamaRecommended([])
      setOllamaError("Failed to reach the backend. Is AntiMatter running?")
    } finally {
      setOllamaFetching(false)
    }
  }, [model])

  useEffect(() => {
    if (provider === "ollama") {
      fetchOllamaModels(ollamaBaseUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  // Fetch memories when Memories tab is opened
  useEffect(() => {
    if (activeTab === "memories" && activeProject?.id) {
      setMemLoading(true)
      memoriesApi.list(activeProject.id)
        .then(res => setMemories(res.data.items || []))
        .catch(() => setMemories([]))
        .finally(() => setMemLoading(false))
    }
  }, [activeTab, activeProject?.id])

  // When provider changes, switch model to provider's default
  const handleProviderChange = (p) => {
    setProvider(p)
    const provMeta = PROVIDERS[p]
    setModel(provMeta?.defaultModel || "")
    setUseCustom(false)
    setCustomModel("")
    setApiKey("")
    setClearKey(false)
    // Reset Ollama state
    setOllamaReachable(null)
    setOllamaError(null)
    setOllamaInstalled([])
    setOllamaRecommended([])
  }

  const handleDeleteMemory = async (memoryId) => {
    if (!activeProject?.id) return
    setDeletingId(memoryId)
    try {
      await memoriesApi.delete(activeProject.id, memoryId)
      setMemories(prev => prev.filter(m => m.id !== memoryId))
    } catch {}
    setDeletingId(null)
  }

  const handleCopyAsSystemPrompt = async () => {
    if (memories.length === 0) return
    const prompt = [
      "## AntiMatter Episodic Memory Context",
      "",
      "The following are lessons learned from past agent sessions in this project:",
      "",
      ...memories.map((m, i) =>
        [`### Lesson ${i + 1}: ${m.task_description.slice(0, 80)}${m.task_description.length > 80 ? "..." : ""}`,
         `**Lesson:** ${m.generalizable_lesson}`,
         m.what_worked ? `**What worked:** ${m.what_worked}` : "",
         m.what_failed_first ? `**What failed first:** ${m.what_failed_first}` : "",
        ].filter(Boolean).join("\n")
      ),
    ].join("\n")
    await navigator.clipboard.writeText(prompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  const handleSave = async () => {
    const finalModel = useCustom ? customModel.trim() : model
    if (!finalModel) return

    let keyPayload = undefined
    if (provider === "ollama") {
      // Ollama has no API key — just save URL and model
      const ok = await saveSettings(provider, finalModel, undefined, ollamaBaseUrl)
      if (ok) { setSaveOk(true); setTimeout(() => setSaveOk(false), 2000) }
      return
    }

    if (clearKey) {
      keyPayload = ""   // explicit empty = clear
    } else if (apiKey.trim()) {
      keyPayload = apiKey.trim()
    }

    const ok = await saveSettings(provider, finalModel, keyPayload)
    if (ok) {
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
    }
  }

  const models = providerModels[provider] || []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-xl max-h-[85vh] flex flex-col pointer-events-auto rounded-3xl border border-white/[0.08] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300"
          style={{
            background: "linear-gradient(150deg, rgba(22, 24, 38, 0.99) 0%, rgba(12, 13, 20, 0.99) 100%)",
            backdropFilter: "blur(24px)",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3.5 px-6 py-5 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-editor-accent/10 border border-editor-accent/25">
              <Settings size={16} className="text-editor-accent" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white tracking-wide">Settings</h2>
              <p className="text-[11px] text-white/50 mt-0.5">Configure model, provider, and manage memories</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-all duration-200"
            >
              <X size={16} />
            </button>
          </div>

          {/* ── Tab Switcher ── */}
          <div className="flex border-b border-white/[0.06] bg-white/[0.01]">
            <button
              onClick={() => setActiveTab("provider")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[12px] font-semibold tracking-wide transition-all duration-250 ${
                activeTab === "provider"
                  ? "text-editor-accent border-b-2 border-editor-accent bg-editor-accent/[0.02]"
                  : "text-white/40 hover:text-white border-b-2 border-transparent"
              }`}
            >
              <Cpu size={13} /> Provider Settings
            </button>
            <button
              onClick={() => setActiveTab("memories")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[12px] font-semibold tracking-wide transition-all duration-250 ${
                activeTab === "memories"
                  ? "text-editor-accent border-b-2 border-editor-accent bg-editor-accent/[0.02]"
                  : "text-white/40 hover:text-white border-b-2 border-transparent"
              }`}
            >
              <Brain size={13} /> Episodic Memory
            </button>
          </div>

          {/* ── Tab Panels ── */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === "provider" ? (
            <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">

              {/* ── Provider Selection ── */}
              <div className="flex flex-col gap-4">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-1">
                  <Cpu size={11} /> Provider Selection
                </label>

                {/* ── Group 1: Core Cloud LLMs ── */}
                <div className="flex flex-col gap-2.5">
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1.5">
                    ⚡ Core Cloud API
                  </p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {["openai", "anthropic", "gemini"].map((key) => {
                      const p = PROVIDERS[key]
                      if (!p) return null
                      const isActive = provider === key
                      return (
                        <button
                          key={key}
                          onClick={() => handleProviderChange(key)}
                          className={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all duration-300 ease-out text-center cursor-pointer
                            ${isActive
                              ? `bg-gradient-to-br ${p.gradient} ${p.border} shadow-[0_8px_20px_-4px_${p.color}25] scale-[1.03] -translate-y-0.5`
                              : "border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.15] hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.97]"
                            }`}
                        >
                          <span className="flex items-center justify-center p-0.5">
                            <p.icon size={16} style={{ color: p.color }} />
                          </span>
                          <span className={`text-[10px] font-semibold transition-colors ${isActive ? "text-white font-bold" : "text-white/60"}`}>
                            {p.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-white/[0.05] my-1" />

                {/* ── Group 2: Specialty & Aggregators ── */}
                <div className="flex flex-col gap-2.5">
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1.5">
                    🌐 Aggregators & Specialized Cloud
                  </p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {["github", "openrouter", "groq"].map((key) => {
                      const p = PROVIDERS[key]
                      if (!p) return null
                      const isActive = provider === key
                      return (
                        <button
                          key={key}
                          onClick={() => handleProviderChange(key)}
                          className={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all duration-300 ease-out text-center cursor-pointer
                            ${isActive
                              ? `bg-gradient-to-br ${p.gradient} ${p.border} shadow-[0_8px_20px_-4px_${p.color}25] scale-[1.03] -translate-y-0.5`
                              : "border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.15] hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.97]"
                            }`}
                        >
                          <span className="flex items-center justify-center p-0.5">
                            <p.icon size={16} style={{ color: p.color }} />
                          </span>
                          <span className={`text-[10px] font-semibold transition-colors ${isActive ? "text-white font-bold" : "text-white/60"}`}>
                            {p.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-white/[0.05] my-1" />

                {/* ── Group 3: Local ── */}
                <div className="flex flex-col gap-2.5">
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1.5">
                    🖥️ Local / Self-Hosted
                  </p>
                  {(() => {
                    const p = PROVIDERS.ollama
                    const isActive = provider === "ollama"
                    return (
                      <button
                        onClick={() => handleProviderChange("ollama")}
                        className={`w-full flex items-center gap-3.5 px-4.5 py-3.5 rounded-2xl border transition-all duration-300 ease-out text-left cursor-pointer
                          ${isActive
                            ? `bg-gradient-to-br ${p.gradient} ${p.border} shadow-[0_8px_20px_-4px_${p.color}25] scale-[1.01]`
                            : "border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.15] hover:scale-[1.01]"
                          }`}
                      >
                        <span className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
                          style={{ background: `${p.color}15`, border: `1px solid ${p.color}25` }}>
                          <p.icon size={16} style={{ color: p.color }} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-[12px] font-semibold transition-colors ${isActive ? "text-white font-bold" : "text-white/60"}`}>
                            {p.label}
                          </span>
                          <span className="block text-[10px] text-white/40 mt-0.5">
                            {p.description}
                          </span>
                        </span>
                        <span className="shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}25` }}>
                          No API Key
                        </span>
                      </button>
                    )
                  })()}
                </div>

                {/* Selected Provider Description Card */}
                <div className="border-t border-white/[0.05] pt-4 mt-5">
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                    ℹ️ Provider Description
                  </p>
                  <div className={`px-4 py-3.5 rounded-2xl border text-[11px] leading-relaxed text-white/70 bg-white/[0.01] border-white/[0.05] shadow-inner`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <meta.icon size={15} style={{ color: meta.color }} />
                      <span className="font-bold text-white text-[12px]">{meta.label}</span>
                    </div>
                    <p className="text-[10px] text-white/50 leading-normal">{meta.description}</p>
                  </div>
                </div>
              </div>



              {/* ── Model Selection ── */}
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-3">
                  <Sparkles size={11} /> Model
                </label>

                {/* ── Ollama: special model picker ── */}
                {provider === "ollama" ? (
                  <div className="flex flex-col gap-3">

                    {/* ── Status header ── */}
                    {ollamaReachable === true && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                        <CheckCircle2 size={11} /> Ollama connected
                        {ollamaInstalled.length > 0
                          ? ` — ${ollamaInstalled.length} model${ollamaInstalled.length !== 1 ? "s" : ""} installed`
                          : " — no models pulled yet"}
                      </div>
                    )}
                    {ollamaReachable === false && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-red-400 font-medium">
                          <WifiOff size={11} /> Ollama not reachable
                        </div>
                        {ollamaError && (
                          <p className="text-[10px] text-red-300/70 leading-relaxed">{ollamaError}</p>
                        )}
                        <p className="text-[10px] text-white/40">
                          Run <code className="font-mono bg-white/[0.05] px-1 rounded text-white/80">ollama serve</code> then click Fetch again.
                          {" "}<a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Install Ollama →</a>
                        </p>
                      </div>
                    )}

                    {/* ── Installed models — selectable dropdown ── */}
                    {ollamaInstalled.length > 0 && (
                      <div>
                        <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <CheckCircle2 size={9} /> Installed — select to use
                        </p>
                        <div className="relative">
                          <select
                            value={model}
                            onChange={e => setModel(e.target.value)}
                            className="w-full appearance-none bg-white/[0.02] border border-emerald-500/20 text-white text-[13px] rounded-xl px-4 py-2.5 pr-8 outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
                          >
                            {ollamaInstalled.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {/* ── Not yet pulled but no installed models ── type manually ── */}
                    {ollamaReachable === true && ollamaInstalled.length === 0 && (
                      <div>
                        <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-1.5">
                          No models pulled — type a model name manually
                        </p>
                        <input
                          type="text"
                          value={model}
                          onChange={e => setModel(e.target.value)}
                          placeholder="e.g. qwen2.5-coder:7b"
                          className="w-full bg-white/[0.02] border border-white/[0.06] focus:border-cyan-500/50 text-white text-[13px] rounded-xl px-4 py-2.5 outline-none transition-colors"
                        />
                      </div>
                    )}

                    {/* ── Ollama offline — manual entry ── */}
                    {ollamaReachable === false && (
                      <div>
                        <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-1.5">
                          Or type a model name manually
                        </p>
                        <input
                          type="text"
                          value={model}
                          onChange={e => setModel(e.target.value)}
                          placeholder="e.g. qwen2.5-coder:7b"
                          className="w-full bg-white/[0.02] border border-white/[0.06] focus:border-cyan-500/50 text-white text-[13px] rounded-xl px-4 py-2.5 outline-none transition-colors"
                        />
                      </div>
                    )}

                    {/* ── Recommended (not installed) ── */}
                    {ollamaRecommended.length > 0 && (
                      <div>
                        <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <AlertTriangle size={9} className="text-amber-400" /> Not installed — pull to use
                        </p>
                        <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
                          {ollamaRecommended.map(r => (
                            <div
                              key={r.name}
                              className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/[0.01] border border-white/[0.05] group"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-mono text-[11px] text-white/60">{r.name}</span>
                                <span className="ml-2 text-[10px] text-white/30">{r.note}</span>
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`ollama pull ${r.name}`)
                                }}
                                className="shrink-0 ml-2 opacity-0 group-hover:opacity-100 text-[9px] text-cyan-400 hover:text-cyan-300 font-mono transition-all px-1.5 py-0.5 rounded border border-cyan-500/30 hover:border-cyan-400/50"
                                title="Copy pull command"
                              >
                                copy pull cmd
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── No fetch attempted yet ── */}
                    {ollamaReachable === null && !ollamaFetching && (
                      <p className="text-[11px] text-white/40">
                        Click <strong className="text-white/60">Fetch</strong> to detect your installed models.
                      </p>
                    )}
                  </div>
                ) : !useCustom ? (
                  <div className="relative">
                    <select
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      className="w-full appearance-none bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] focus:border-editor-accent/40 text-white text-[13px] rounded-xl px-4 py-2.5 pr-8 outline-none transition-colors cursor-pointer"
                    >
                      {models.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      {model && !models.includes(model) && (
                        <option value={model}>{model}</option>
                      )}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="e.g. openai/gpt-4.1-nano"
                    className="w-full bg-white/[0.02] border border-white/[0.06] focus:border-editor-accent/40 text-white text-[13px] rounded-xl px-4 py-2.5 outline-none transition-colors"
                  />
                )}
                {provider !== "ollama" && (
                  <button
                    onClick={() => { setUseCustom(p => !p); setCustomModel("") }}
                    className="mt-2 text-[10px] text-white/40 hover:text-editor-accent transition-colors cursor-pointer"
                  >
                    {useCustom ? "← Back to model list" : "Enter custom model name →"}
                  </button>
                )}
              </div>

              {/* ── API Key —— hidden for Ollama ── */}
              {provider !== "ollama" ? (
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-3">
                  <Key size={11} /> API Key
                  {hasApiKey && !clearKey && (
                    <span className="ml-auto flex items-center gap-1 text-emerald-400 normal-case font-medium tracking-normal">
                      <CheckCircle2 size={11} /> Key saved
                    </span>
                  )}
                </label>

                <div className="relative flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={e => { setApiKey(e.target.value); setClearKey(false) }}
                      placeholder={
                        hasApiKey && !clearKey
                          ? "••••••••••••  (saved — leave blank to keep)"
                          : meta.keyPlaceholder
                      }
                      className="w-full bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] focus:border-editor-accent/40 text-white text-[13px] rounded-xl px-4 py-2.5 pr-10 outline-none transition-colors font-mono placeholder:font-sans placeholder:text-white/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {hasApiKey && !clearKey && (
                    <button
                      onClick={() => { setClearKey(true); setApiKey("") }}
                      className="shrink-0 px-3.5 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Clear saved key"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {clearKey && (
                  <p className="mt-2 text-[11px] text-red-400 flex items-center gap-1.5">
                    <AlertCircle size={11} /> Key will be cleared on save. Backend fallback will be used.
                  </p>
                )}

                <a
                  href={meta.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1 text-[11px] transition-colors hover:underline"
                  style={{ color: meta.color }}
                >
                  {meta.docsLabel} <ExternalLink size={10} />
                </a>

                {/* Security note */}
                <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-white/[0.01] border border-white/[0.05]">
                  <Shield size={13} className="text-white/30 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    Your API key is stored securely server-side and tied to your account. It is never returned to the browser after saving. Your key overrides AntiMatter's backend fallback key for this provider.
                  </p>
                </div>
              </div>
              ) : (
              /* ── Ollama: Base URL + Fetch button instead of API key ── */
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-3">
                  <Server size={11} /> Ollama Endpoint
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ollamaBaseUrl}
                    onChange={e => { setOllamaBaseUrl(e.target.value); setOllamaReachable(null); setOllamaError(null) }}
                    placeholder="http://localhost:11434/v1"
                    className="flex-1 bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] focus:border-cyan-500/40 text-white text-[13px] rounded-xl px-4 py-2.5 outline-none transition-colors font-mono placeholder:font-sans placeholder:text-white/20"
                  />
                  <button
                    onClick={() => fetchOllamaModels(ollamaBaseUrl)}
                    disabled={ollamaFetching}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[12px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
                    title="Fetch installed models from Ollama"
                  >
                    {ollamaFetching
                      ? <Loader2 size={13} className="animate-spin" />
                      : <RefreshCw size={13} />}
                    {ollamaFetching ? "Fetching…" : "Fetch"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-white/40">
                  No API key needed. Ollama runs entirely on your machine.
                  {" "}<a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Install Ollama →</a>
                </p>
              </div>
              )}

              {/* ── Error banner ── */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-950/20 border border-red-500/20 text-red-300 text-[12px]">
                  <AlertCircle size={13} className="shrink-0 text-red-400" />
                  {error}
                </div>
              )}
            </div>
          ) : (
            /* ── Memories Tab ── */
            <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-white">Episodic Memories</p>
                  <p className="text-[11px] text-white/50 mt-0.5">Lessons learned from past agent sessions in this project.</p>
                </div>
                <button
                  onClick={handleCopyAsSystemPrompt}
                  disabled={memories.length === 0 || copiedPrompt}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-[12px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Copy all memories as a system prompt to clipboard"
                >
                  {copiedPrompt ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiedPrompt ? "Copied!" : "Copy as Prompt"}
                </button>
              </div>

              {memLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin text-white/30" />
                </div>
              ) : memories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-white/30 text-center">
                  <Brain size={32} className="mb-3 opacity-20" />
                  <p className="text-[13px] font-semibold">No memories yet</p>
                  <p className="text-[11px] mt-1 opacity-60">Memories are created automatically after agent tasks.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {memories.map((mem) => (
                    <div
                      key={mem.id}
                      className="p-4 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:border-white/[0.1] transition-colors duration-200 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-white truncate">{mem.task_description}</p>
                          <p className="text-[11px] text-indigo-300/80 mt-1.5 leading-relaxed">{mem.generalizable_lesson}</p>
                          {mem.what_worked && (
                            <p className="text-[10px] text-emerald-400/80 mt-1">✓ {mem.what_worked}</p>
                          )}
                          {mem.what_failed_first && (
                            <p className="text-[10px] text-red-400/80 mt-0.5">✗ {mem.what_failed_first}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[9px] text-white/30 font-mono">{new Date(mem.created_at).toLocaleDateString()}</span>
                            <span className="text-[9px] text-white/30">Retrieved {mem.retrieval_count}×</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteMemory(mem.id)}
                          disabled={deletingId === mem.id}
                          className="shrink-0 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Delete memory"
                        >
                          {deletingId === mem.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>{/* end min-h wrapper */}

          {/* ── Footer ── */}
          {activeTab === "provider" && (
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/[0.06] bg-white/[0.02]">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/[0.05] transition-all duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 shadow-lg cursor-pointer
                  ${saveOk
                    ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 shadow-emerald-500/5"
                    : "bg-editor-accent hover:bg-editor-accent/90 hover:scale-[1.02] active:scale-[0.98] text-editor-bg shadow-editor-accent/15 disabled:bg-white/[0.05] disabled:text-white/20 disabled:scale-100 disabled:shadow-none"
                  }`}
              >
                {isSaving ? (
                  <><Loader2 size={13} className="animate-spin" /> Saving…</>
                ) : saveOk ? (
                  <><CheckCircle2 size={13} /> Saved!</>
                ) : (
                  "Save Settings"
                )}
              </button>
            </div>
          )}
          {activeTab === "memories" && (
            <div className="flex items-center justify-end px-6 py-3.5 border-t border-white/[0.06] bg-white/[0.02]">
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white/60 hover:text-white hover:bg-white/[0.05] transition-all duration-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
