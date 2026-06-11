import { useState, useEffect, useCallback } from "react"
import {
  X, Settings, Key, ChevronDown, Eye, EyeOff, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, Cpu, Sparkles, Shield
} from "lucide-react"
import { useSettingsStore } from "../stores/settingsStore"
import api from "../lib/api"

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = {
  groq: {
    label: "Groq",
    icon: "⚡",
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
    icon: "🐙",
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
    icon: "🤖",
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
    icon: "🔀",
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
    icon: "🧠",
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
    icon: "✨",
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
                    <span className="text-lg leading-none">{p.icon}</span>
                    <span className={`text-[10px] font-semibold ${provider === key ? "text-white" : "text-editor-muted"}`}>
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Provider description */}
              <div className={`mt-3 px-3 py-2 rounded-lg border text-[11px] text-editor-muted bg-gradient-to-r ${meta.gradient} ${meta.border}`}>
                <span style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
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
