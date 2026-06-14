import { useState, useEffect } from "react"
import {
  ChevronDown, ChevronUp,
  FileText, Terminal, Search, Package, TestTube,
  Globe, Image, Play, Activity, CheckCircle2, XCircle,
  Loader2, Cpu, Clock
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
        <span
          className="shrink-0 text-[9px] font-mono font-bold w-4 text-right"
          style={{ color: color + "70" }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        <div
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center"
          style={{ background: color + "18", border: `1px solid ${color}30` }}
        >
          <Icon size={11} style={{ color }} />
        </div>

        <span className="text-[12px] font-semibold text-white/90 truncate flex-1 min-w-0">
          {label}
        </span>

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

        <span className="shrink-0">{statusIcon}</span>
      </div>

      {inputPreview && (
        <div className="ml-11 text-[10px] text-editor-muted/70 font-mono truncate leading-relaxed">
          {inputPreview}
        </div>
      )}

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

      {isRunning && (
        <div className="ml-11 mt-1">
          <div className="skeleton-bar h-[3px] rounded-full" style={{ width: "60%" }} />
        </div>
      )}
    </div>
  )
}

// ─── Collapsible Dropdown Component ───────────────────────────────────────────
export default function ActivityDropdown({ entries, isLive }) {
  const [isOpen, setIsOpen] = useState(isLive)

  // Auto-open when new entries arrive in live mode
  useEffect(() => {
    if (isLive) {
      setIsOpen(true)
    }
  }, [entries.length, isLive])

  if (!entries || entries.length === 0) return null

  const runningCount = entries.filter(e => e.status === "running").length
  const errorCount   = entries.filter(e => e.status === "error").length
  const doneCount    = entries.filter(e => e.status === "done").length

  const getHeaderIcon = () => {
    if (isLive) {
      return (
        <div className="relative shrink-0 flex items-center justify-center w-4 h-4">
          <span
            className="absolute inset-0 rounded-full animate-ping bg-blue-500/30"
            style={{ animationDuration: "1.4s" }}
          />
          <Loader2 size={12} className="animate-spin text-blue-400" />
        </div>
      )
    }
    if (errorCount > 0) {
      return <XCircle size={14} className="text-red-400 shrink-0" />
    }
    return <CheckCircle2 size={14} className="text-green-400 shrink-0" />
  }

  return (
    <div className="my-2 self-start w-full max-w-[92%]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-editor-highlight/20 hover:bg-editor-highlight/40 border border-editor-border/30 rounded-xl transition-all text-left group"
      >
        {getHeaderIcon()}

        <span className="text-[11px] font-bold uppercase tracking-wider text-editor-muted group-hover:text-white transition-colors">
          {isLive ? "Agent Executing..." : "Agent Activity"}
        </span>

        <span className="text-[10px] text-editor-muted/60 font-mono">
          ({entries.length} {entries.length === 1 ? "step" : "steps"})
        </span>

        {!isOpen && (
          <div className="hidden sm:flex items-center gap-1.5 ml-2 text-[9px] text-editor-muted/50 font-mono">
            {doneCount > 0 && <span>{doneCount} done</span>}
            {errorCount > 0 && <span className="text-red-400/80">{errorCount} error</span>}
          </div>
        )}

        <span className="ml-auto text-editor-muted/50 group-hover:text-editor-muted transition-colors">
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-1.5 mt-2 pl-3 ml-2 border-l border-editor-border/30 animate-in fade-in duration-200">
          {entries.map((entry, i) => (
            <TraceEntry key={entry.id} entry={entry} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
