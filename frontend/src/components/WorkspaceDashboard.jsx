import { useEffect, useState } from "react"
import {
  LayoutDashboard, Wifi, WifiOff, Cpu, Database, Coins,
  Timer, Activity, FolderOpen, Zap, X, Clock, Pencil
} from "lucide-react"
import { useProjectStore }    from "../stores/projectStore"
import { useSettingsStore }   from "../stores/settingsStore"
import { useChatStore }       from "../stores/chatStore"
import { useAgentTraceStore } from "../stores/agentTraceStore"
import { useFileTreeStore }   from "../stores/fileTreeStore"
import { projectsApi }        from "../lib/api"

// ─── Model context window reference table ─────────────────────────────────────
const MODEL_CTX = {
  // OpenAI
  "gpt-4o":             128_000,
  "gpt-4o-mini":        128_000,
  "gpt-4-turbo":        128_000,
  "gpt-3.5-turbo":      16_385,
  // Anthropic
  "claude-3-5-sonnet":  200_000,
  "claude-3-opus":      200_000,
  "claude-sonnet-4-5":  200_000,
  // Gemini
  "gemini-1.5-pro":   1_048_576,
  "gemini-1.5-flash": 1_048_576,
  // Groq / Llama
  "llama-3.3-70b-versatile": 128_000,
  "llama-3.1-8b-instant":    128_000,
  "llama-3.1-70b-versatile": 128_000,
  "mixtral-8x7b-32768":       32_768,
  // Fallback
  default: 128_000,
}

function getCtxWindow(model) {
  if (!model) return MODEL_CTX.default
  for (const [key, val] of Object.entries(MODEL_CTX)) {
    if (model.toLowerCase().includes(key.toLowerCase())) return val
  }
  return MODEL_CTX.default
}

function formatUptime(startMs) {
  const elapsed = Math.floor((Date.now() - startMs) / 1000)
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const SESSION_START = Date.now()

// ─── Stat row ────────────────────────────────────────────────────────────────
function StatRow({ icon: Icon, color, label, value, sub, mono = false }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-editor-border/20 last:border-0">
      <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: color + "15", border: `1px solid ${color}25` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-editor-muted/60 uppercase tracking-wider font-semibold">{label}</div>
        <div className={`text-[13px] font-semibold text-white truncate ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      {sub && <span className="text-[10px] text-editor-muted/50 font-mono shrink-0">{sub}</span>}
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function WorkspaceDashboard({ onClose }) {
  const project    = useProjectStore((s) => s.activeProject)
  const provider   = useSettingsStore((s) => s.provider)
  const model      = useSettingsStore((s) => s.model)
  const isConnected = useChatStore((s) => s.isConnected)
  const messages   = useChatStore((s) => s.messages)
  const entries    = useAgentTraceStore((s) => s.entries)
  const isActive   = useAgentTraceStore((s) => s.isActive)
  const syncing    = useFileTreeStore((s) => s.syncing)

  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(project?.name || "")
  const updateActiveProject = useProjectStore((s) => s.updateActiveProject)

  useEffect(() => {
    if (project?.name) {
      setEditedName(project.name)
    }
  }, [project?.name])

  const handleSaveName = async () => {
    const trimmed = editedName.trim()
    if (!trimmed || trimmed === project?.name) {
      setIsEditingName(false)
      return
    }
    try {
      const res = await projectsApi.update(project.id, trimmed, project.description || "")
      updateActiveProject(res.data)
    } catch (err) {
      console.error("Failed to update project name", err)
    } finally {
      setIsEditingName(false)
    }
  }

  // Total session tokens
  const totalTokens = messages.reduce((acc, msg) => {
    if (msg.role !== "activity" || !msg.entries) return acc
    return acc + msg.entries.reduce((a2, e) => {
      if (e.type === "lifecycle" && e.meta?.tokens?.total_tokens) return a2 + e.meta.tokens.total_tokens
      return a2
    }, 0)
  }, 0)

  // Last agent run latency
  const lastLatency = (() => {
    const all = [...messages].reverse()
    const activity = all.find(m => m.role === "activity")
    if (!activity?.entries) return null
    const done = activity.entries.filter(e => e.durationMs != null)
    if (!done.length) return null
    const total = done.reduce((a, e) => a + e.durationMs, 0)
    return total < 1000 ? `${total}ms` : `${(total / 1000).toFixed(1)}s`
  })()

  // Context window usage
  const ctxWindow = getCtxWindow(model)
  const ctxUsed   = messages.reduce((acc, msg) => {
    if (msg.role !== "activity" || !msg.entries) return acc
    return acc + msg.entries.reduce((a2, e) => {
      if (e.type === "lifecycle" && e.meta?.tokens) {
        return a2 + (e.meta.tokens.input_tokens || 0)
      }
      return a2
    }, 0)
  }, 0)
  const ctxPct = Math.min(100, Math.round((ctxUsed / ctxWindow) * 100))
  const ctxColor = ctxPct < 60 ? "#9ece6a" : ctxPct < 85 ? "#ff9e64" : "#f7768e"

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[250] flex items-start justify-end pt-14 pr-4 pointer-events-none">
      <div
        className="pointer-events-auto w-[300px] rounded-2xl overflow-hidden
          shadow-[0_24px_64px_rgba(0,0,0,0.6)]
          animate-in slide-in-from-top-4 fade-in duration-200"
        style={{
          background: "linear-gradient(160deg, rgba(22,23,34,0.97) 0%, rgba(16,17,26,0.99) 100%)",
          border: "1px solid rgba(115,218,202,0.15)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-editor-border/30"
          style={{ background: "rgba(115,218,202,0.04)" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "#73daca15", border: "1px solid #73daca25" }}>
            <LayoutDashboard size={13} className="text-teal-400" />
          </div>
          <div>
            <div className="text-[13px] font-bold text-white">Workspace Health</div>
            <div className="text-[10px] text-editor-muted/50">Live metrics</div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-6 h-6 rounded-md flex items-center justify-center
              text-editor-muted hover:text-white hover:bg-editor-highlight/60 transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* Stats */}
        <div className="px-4 py-1">
          {/* Active Project Row (Inline editable) */}
          <div className="flex items-center gap-3 py-2.5 border-b border-editor-border/20">
            <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "#9ece6a15", border: "1px solid #9ece6a25" }}>
              <FolderOpen size={13} className="text-[#9ece6a]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-editor-muted/60 uppercase tracking-wider font-semibold">Active Project</div>
              {isEditingName ? (
                <input
                  className="bg-editor-bg border border-blue-500/50 rounded px-1.5 py-0.5 text-[13px] text-white w-full outline-none focus:ring-1 focus:ring-blue-500/50 font-medium"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName()
                    if (e.key === "Escape") {
                      setIsEditingName(false)
                      setEditedName(project?.name || "")
                    }
                  }}
                  autoFocus
                />
              ) : (
                <div 
                  onClick={() => {
                    if (project) {
                      setIsEditingName(true)
                      setEditedName(project.name)
                    }
                  }}
                  className="flex items-center gap-1.5 group/proj cursor-pointer"
                  title="Click to rename project"
                >
                  <div className="text-[13px] font-semibold text-white truncate group-hover/proj:text-blue-400 transition-colors">
                    {project?.name ?? "—"}
                  </div>
                  {project && (
                    <Pencil size={10} className="text-editor-muted/40 opacity-0 group-hover/proj:opacity-100 transition-opacity shrink-0 animate-in fade-in duration-200" />
                  )}
                </div>
              )}
            </div>
            {project && (
              <span className="text-[10px] text-editor-muted/50 font-mono shrink-0">
                #{String(project.id).slice(0,6)}
              </span>
            )}
          </div>
          <StatRow
            icon={isConnected ? Wifi : WifiOff}
            color={isConnected ? "#9ece6a" : "#f7768e"}
            label="WebSocket"
            value={isConnected ? "Connected" : "Offline"}
            sub={isActive ? "Agent running" : undefined}
          />
          <StatRow
            icon={Cpu}
            color="#7aa2f7"
            label="Model"
            value={model || "—"}
            sub={provider}
            mono
          />
          <StatRow
            icon={Coins}
            color="#ff9e64"
            label="Session Tokens"
            value={totalTokens > 0 ? totalTokens.toLocaleString() : "—"}
            sub={totalTokens > 0 ? `${(totalTokens / 1000).toFixed(1)}k` : undefined}
          />

          {/* Context bar */}
          <div className="py-2.5 border-b border-editor-border/20">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: ctxColor + "15", border: `1px solid ${ctxColor}25` }}>
                  <Database size={13} style={{ color: ctxColor }} />
                </div>
                <div>
                  <div className="text-[10px] text-editor-muted/60 uppercase tracking-wider font-semibold">Context Window</div>
                  <div className="text-[13px] font-semibold" style={{ color: ctxColor }}>
                    {ctxPct}% used
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-editor-muted/40">
                {(ctxWindow / 1000).toFixed(0)}k ctx
              </span>
            </div>
            <div className="h-[4px] rounded-full bg-editor-highlight/40 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${ctxPct}%`, background: `linear-gradient(90deg, ${ctxColor}80, ${ctxColor})` }}
              />
            </div>
          </div>

          <StatRow
            icon={Zap}
            color="#bb9af7"
            label="Last Run Latency"
            value={lastLatency ?? "—"}
          />
          <StatRow
            icon={Activity}
            color="#7dcfff"
            label="Indexing Status"
            value={syncing ? "Syncing…" : "Up to date"}
            sub={syncing ? undefined : "✓"}
          />
          <StatRow
            icon={Clock}
            color="#a9b1d6"
            label="Session Uptime"
            value={formatUptime(SESSION_START)}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-editor-border/20"
          style={{ background: "rgba(0,0,0,0.15)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-editor-muted/40">AntiMatter IDE</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
              <span className="text-[10px] font-mono text-editor-muted/40">
                {isConnected ? "LIVE" : "OFFLINE"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
