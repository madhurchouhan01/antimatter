import { useState, useEffect } from "react"
import {
  X, Settings, Key, ChevronDown, Eye, EyeOff, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Cpu, Sparkles, Shield,
  Zap, Shuffle
} from "lucide-react"
import { useSettingsStore } from "../stores/settingsStore"
import api from "../lib/api"

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

  const [provider, setProvider]       = useState(savedProvider)
  const [model,    setModel]          = useState(savedModel)
  const [apiKey,   setApiKey]         = useState("")
  const [showKey,  setShowKey]        = useState(false)
  const [clearKey, setClearKey]       = useState(false)
  const [providerModels, setProviderModels] = useState({})
  const [customModel, setCustomModel] = useState("")
  const [useCustom, setUseCustom]     = useState(false)
  const [saveOk,   setSaveOk]         = useState(false)

  const meta = PROVIDERS[provider] || PROVIDERS.groq

  // Load provider→model catalogue from backend
  useEffect(() => {
    api.get("/api/settings/models").then(res => setProviderModels(res.data)).catch(() => {})
  }, [])

  // When provider changes, switch model to provider's default
  const handleProviderChange = (p) => {
    setProvider(p)
    const provMeta = PROVIDERS[p]
    setModel(provMeta?.defaultModel || "")
    setUseCustom(false)
    setCustomModel("")
    setApiKey("")
    setClearKey(false)
  }

  const handleSave = async () => {
    const finalModel = useCustom ? customModel.trim() : model
    if (!finalModel) return

    let keyPayload = undefined
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
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-xl pointer-events-auto rounded-2xl border border-editor-border/60 shadow-[0_0_80px_rgba(0,0,0,0.6)] overflow-hidden"
          style={{
            background: "linear-gradient(160deg, rgba(22,24,37,0.98) 0%, rgba(17,18,27,0.99) 100%)",
            backdropFilter: "blur(24px)",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-editor-border/40 bg-white/[0.02]">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-editor-accent/10 border border-editor-accent/20">
              <Settings size={15} className="text-editor-accent" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white tracking-wide">AI Provider Settings</h2>
              <p className="text-[11px] text-editor-muted">Configure model, provider and API key</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto p-1.5 rounded-lg text-editor-muted hover:text-white hover:bg-editor-highlight transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="p-6 flex flex-col gap-6 max-h-[75vh] overflow-y-auto scrollbar-thin">

            {/* ── Provider Selection ── */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-editor-muted uppercase tracking-widest mb-3">
                <Cpu size={11} /> Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(PROVIDERS).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => handleProviderChange(key)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center
                      ${provider === key
                        ? `bg-gradient-to-br ${p.gradient} ${p.border} shadow-sm`
                        : "border-editor-border/40 hover:border-editor-border hover:bg-editor-highlight/30"
                      }`}
                  >
                    <span className="flex items-center justify-center p-0.5">
                      <p.icon size={16} style={{ color: p.color }} />
                    </span>
                    <span className={`text-[10px] font-semibold ${provider === key ? "text-white" : "text-editor-muted"}`}>
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Provider description */}
              <div className={`mt-3 px-3 py-2.5 rounded-lg border text-[11px] text-editor-muted bg-gradient-to-r ${meta.gradient} ${meta.border}`}>
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: meta.color }}>
                  <meta.icon size={12} className="mr-0.5" />
                  {meta.label}
                </span>
                {" — "}{meta.description}
              </div>
            </div>

            {/* ── Model Selection ── */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-editor-muted uppercase tracking-widest mb-3">
                <Sparkles size={11} /> Model
              </label>
              {!useCustom ? (
                <div className="relative">
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="w-full appearance-none bg-editor-bg border border-editor-border text-white text-[13px] rounded-xl px-4 py-2.5 pr-8 outline-none focus:border-editor-accent/70 transition-colors cursor-pointer"
                  >
                    {models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {model && !models.includes(model) && (
                      <option value={model}>{model}</option>
                    )}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-editor-muted pointer-events-none" />
                </div>
              ) : (
                <input
                  type="text"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  placeholder="e.g. openai/gpt-4.1-nano"
                  className="w-full bg-editor-bg border border-editor-border focus:border-editor-accent/70 text-white text-[13px] rounded-xl px-4 py-2.5 outline-none transition-colors"
                />
              )}
              <button
                onClick={() => { setUseCustom(p => !p); setCustomModel("") }}
                className="mt-2 text-[10px] text-editor-muted hover:text-editor-accent transition-colors"
              >
                {useCustom ? "← Back to model list" : "Enter custom model name →"}
              </button>
            </div>

            {/* ── API Key ── */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-editor-muted uppercase tracking-widest mb-3">
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
                    className="w-full bg-editor-bg border border-editor-border focus:border-editor-accent/70 text-white text-[13px] rounded-xl px-4 py-2.5 pr-10 outline-none transition-colors font-mono placeholder:font-sans placeholder:text-editor-muted/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-editor-muted hover:text-white transition-colors"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {hasApiKey && !clearKey && (
                  <button
                    onClick={() => { setClearKey(true); setApiKey("") }}
                    className="shrink-0 px-3 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-medium transition-colors"
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
              <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-editor-highlight/20 border border-editor-border/30">
                <Shield size={12} className="text-editor-muted shrink-0 mt-0.5" />
                <p className="text-[10px] text-editor-muted leading-relaxed">
                  Your API key is stored securely server-side and tied to your account. It is never returned to the browser after saving. Your key overrides AntiMatter's backend fallback key for this provider.
                </p>
              </div>
            </div>

            {/* ── Error banner ── */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/30 text-red-300 text-[12px]">
                <AlertCircle size={13} className="shrink-0 text-red-400" />
                {error}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-editor-border/40 bg-white/[0.02]">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[13px] text-editor-muted hover:text-white hover:bg-editor-highlight transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-semibold transition-all shadow-lg
                ${saveOk
                  ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
                  : "bg-editor-accent hover:bg-editor-accentHover text-editor-bg disabled:bg-editor-highlight disabled:text-editor-muted"
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
        </div>
      </div>
    </>
  )
}
