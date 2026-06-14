import { useRef, useEffect } from "react"
import { useAgentTraceStore } from "../stores/agentTraceStore"
import {
  ChevronDown, ChevronRight,
  FileText, Terminal, Search, Package, TestTube,
  Globe, Image, Play, Activity, CheckCircle2, XCircle,
  Loader2, Cpu, Clock, ChevronUp,
} from "lucide-react"

// ─── Tool metadata ────────────────────────────────────────────────────────────
const TOOL_META = {
  read_file:               { icon: FileText,  color: "#7aa2f7", label: "Read file"           },
  write_file:              { icon: FileText,  color: "#9ece6a", label: "Write file"           },
  replace_file_content:    { icon: FileText,  color: "#9ece6a", label: "Edit file"            },
  multi_replace_file_content:{ icon: FileText,color: "#9ece6a", label: "Multi-edit file"      },
  list_files:              { icon: Search,    color: "#7dcfff", label: "List files"           },
  search_files:            { icon: Search,    color: "#7dcfff", label: "Search files"         },
  run_command:             { icon: Terminal,  color: "#bb9af7", label: "Run command"          },
  run_background_command:  { icon: Terminal,  color: "#bb9af7", label: "Run background"       },
  command_status:          { icon: Activity,  color: "#bb9af7", label: "Check command"        },
  send_command_input:      { icon: Terminal,  color: "#bb9af7", label: "Send input"           },
  install_packages:        { icon: Package,   color: "#ff9e64", label: "Install packages"     },
  run_tests:               { icon: TestTube,  color: "#73daca", label: "Run tests"            },
  search_web:              { icon: Globe,     color: "#7dcfff", label: "Search web"           },
  generate_image:          { icon: Image,     color: "#ff9e64", label: "Generate image"       },
}

function getToolMeta(tool) {
  return TOOL_META[tool] ?? { icon: Cpu, color: "#a9b1d6", label: tool }
}

// ─── Format duration ─────────────────────────────────────────────────────────
function fmtDuration(ms) {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Truncate long strings ────────────────────────────────────────────────────
function truncate(str, n = 120) {
  if (!str) return ""
  const s = typeof str === "string" ? str : JSON.stringify(str)
  return s.length > n ? s.slice(0, n) + "…" : s
}

// ─── Single tool-call row ─────────────────────────────────────────────────────
function TraceEntry({ entry, index }) {
  const { icon: Icon, color, label } = getToolMeta(entry.tool)
  const isRunning = entry.status === "running"
  const isError   = entry.status === "error"
  const isDone    = entry.status === "done"

  // Format input preview
  const inputPreview = (() => {
    const inp = entry.input
    if (!inp || Object.keys(inp).length === 0) return null
    // Show the first meaningful string value
    const firstValue = Object.values(inp).find(v => typeof v === "string")
    return firstValue ? truncate(firstValue, 80) : truncate(JSON.stringify(inp), 80)
  })()

  const statusIcon = isRunning
    ? <Loader2 size={11} className="animate-spin" style={{ color }} />
    : isError
    ? <XCircle size={11} className="text-red-400" />
    : <CheckCircle2 size={11} className="text-green-400" />

  return (
    <div
      className="group relative flex flex-col gap-0.5 py-2 px-3 rounded-lg transition-colors"
      style={{
        background: isRunning
          ? `linear-gradient(90deg, ${color}08, transparent)`
          : "transparent",
        borderLeft: `2px solid ${isRunning ? color : isError ? "#f7768e" : color + "40"}`,
        opacity: isRunning ? 1 : 0.85,
      }}
    >
      {/* Top row: icon + label + duration */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Sequence number */}
        <span
          className="shrink-0 text-[9px] font-mono font-bold w-4 text-right"
          style={{ color: color + "70" }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Tool icon */}
        <div
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center"
          style={{ background: color + "18", border: `1px solid ${color}30` }}
        >
          <Icon size={11} style={{ color }} />
        </div>

        {/* Label */}
        <span className="text-[12px] font-semibold text-white/90 truncate flex-1 min-w-0">
          {label}
        </span>

        {/* Duration badge */}
        {entry.durationMs != null && (
          <span
            className="shrink-0 flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              color: color,
              background: color + "15",
              border: `1px solid ${color}25`,
            }}
          >
            <Clock size={8} />
            {fmtDuration(entry.durationMs)}
          </span>
        )}

        {/* Status icon */}
        <span className="shrink-0">{statusIcon}</span>
      </div>

      {/* Input preview */}
      {inputPreview && (
        <div className="ml-11 text-[10px] text-editor-muted/70 font-mono truncate leading-relaxed">
          {inputPreview}
        </div>
      )}

      {/* Output preview (on done/error) */}
      {!isRunning && entry.output && (
        <div
          className="ml-11 text-[10px] font-mono leading-relaxed rounded px-1.5 py-1 mt-0.5 line-clamp-2"
          style={{
            color: isError ? "#f7768e99" : "#a9b1d699",
            background: isError ? "#f7768e08" : "transparent",
          }}
        >
          {truncate(entry.output, 100)}
        </div>
      )}

      {/* Running shimmer bar */}
      {isRunning && (
        <div className="ml-11 mt-1">
          <div className="skeleton-bar h-[3px] rounded-full" style={{ width: "60%" }} />
        </div>
      )}
    </div>
  )
}

// ─── The panel itself ─────────────────────────────────────────────────────────
export default function AgentActivityPanel() {
  const entries    = useAgentTraceStore((s) => s.entries)
  const isActive   = useAgentTraceStore((s) => s.isActive)
  const panelOpen  = useAgentTraceStore((s) => s.panelOpen)
  const togglePanel = useAgentTraceStore((s) => s.togglePanel)

  const scrollRef = useRef(null)

  // Auto-scroll to bottom as new entries arrive
  useEffect(() => {
    if (panelOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, panelOpen])

  // Only render the panel if there are entries or the agent is active
  if (entries.length === 0 && !isActive) return null

  const runningCount = entries.filter(e => e.status === "running").length
  const doneCount    = entries.filter(e => e.status === "done").length
  const errorCount   = entries.filter(e => e.status === "error").length

  return (
    <div
      className="shrink-0 border-t border-editor-border/40"
      style={{
        background: "linear-gradient(180deg, rgba(26,27,38,0.98) 0%, rgba(22,23,32,0.99) 100%)",
      }}
    >
      {/* ── Header bar ── */}
      <button
        onClick={togglePanel}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-editor-highlight/20 transition-colors group"
      >
        {/* Live pulse */}
        <div className="relative shrink-0 flex items-center justify-center w-4 h-4">
          {isActive && (
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "rgba(122,162,247,0.3)", animationDuration: "1.4s" }}
            />
          )}
          <Play
            size={8}
            className="relative z-10"
            style={{ color: isActive ? "#7aa2f7" : "#565f89", fill: isActive ? "#7aa2f7" : "#565f89" }}
          />
        </div>

        <span className="text-[10px] font-bold uppercase tracking-widest text-editor-muted group-hover:text-white transition-colors">
          Agent Activity
        </span>

        {/* Counters */}
        <div className="flex items-center gap-1.5 ml-1">
          {runningCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/20">
              {runningCount} running
            </span>
          )}
          {doneCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono bg-green-500/10 text-green-400/70">
              {doneCount} done
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono bg-red-500/10 text-red-400/70">
              {errorCount} err
            </span>
          )}
        </div>

        <span className="ml-auto text-editor-muted/50 group-hover:text-editor-muted transition-colors">
          {panelOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </span>
      </button>

      {/* ── Entry list ── */}
      {panelOpen && (
        <div
          ref={scrollRef}
          className="flex flex-col gap-0 overflow-y-auto scrollbar-thin"
          style={{ maxHeight: "220px" }}
        >
          {entries.map((entry, i) => (
            <TraceEntry key={entry.id} entry={entry} index={i} />
          ))}

          {/* Bottom padding so last entry isn't clipped */}
          <div className="h-2 shrink-0" />
        </div>
      )}
    </div>
  )
}
