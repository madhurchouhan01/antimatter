import { useState, useEffect } from "react"
import {
  ChevronDown, ChevronUp,
  FileText, Terminal, Search, Package, TestTube,
  Globe, Image, Activity, CheckCircle2, XCircle,
  Loader2, Cpu, Clock, Brain, Zap, Database, Layers,
  MessageSquare, Coins, Sparkles, Play
} from "lucide-react"

// ─── Tool metadata ────────────────────────────────────────────────────────────
const TOOL_META = {
  read_file:                  { icon: FileText,  color: "#7aa2f7", label: "Read file"          },
  write_file:                 { icon: FileText,  color: "#9ece6a", label: "Write file"          },
  replace_file_content:       { icon: FileText,  color: "#9ece6a", label: "Edit file"           },
  multi_replace_file_content: { icon: FileText,  color: "#9ece6a", label: "Multi-edit file"     },
  list_files:                 { icon: Search,    color: "#7dcfff", label: "List files"          },
  search_files:               { icon: Search,    color: "#7dcfff", label: "Search files"        },
  run_command:                { icon: Terminal,  color: "#bb9af7", label: "Run command"         },
  run_background_command:     { icon: Terminal,  color: "#bb9af7", label: "Run background"      },
  command_status:             { icon: Activity,  color: "#bb9af7", label: "Check command"       },
  send_command_input:         { icon: Terminal,  color: "#bb9af7", label: "Send input"          },
  install_packages:           { icon: Package,   color: "#ff9e64", label: "Install packages"    },
  run_tests:                  { icon: TestTube,  color: "#73daca", label: "Run tests"           },
  search_web:                 { icon: Globe,     color: "#7dcfff", label: "Search web"          },
  generate_image:             { icon: Image,     color: "#ff9e64", label: "Generate image"      },
}

// ─── Lifecycle step metadata ──────────────────────────────────────────────────
const LIFECYCLE_META = {
  classify:    { icon: Brain,        color: "#bb9af7", defaultLabel: "Understanding query"          },
  context:     { icon: Database,     color: "#7dcfff", defaultLabel: "Building context"             },
  llm_call:    { icon: Sparkles,     color: "#7aa2f7", defaultLabel: "Streaming LLM response"       },
  finalize:    { icon: CheckCircle2, color: "#9ece6a", defaultLabel: "Finalizing response"          },
  cmd_running: { icon: Play,         color: "#bb9af7", defaultLabel: "Running command"              },
}

const ROUTE_LABELS = {
  coding:            "Agent Loop",
  codebase_question: "Codebase Q&A",
  diagram:           "Diagram Generator",
  general_chat:      "General Chat",
  off_topic:         "Off-topic",
}

const ROUTE_COLORS = {
  coding:            "#7aa2f7",
  codebase_question: "#7dcfff",
  diagram:           "#bb9af7",
  general_chat:      "#9ece6a",
  off_topic:         "#a9b1d6",
}

function getToolMeta(tool) {
  return TOOL_META[tool] ?? { icon: Cpu, color: "#a9b1d6", label: tool }
}

function fmtDuration(ms) {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtDelta(ms) {
  if (ms == null || ms < 0) return null
  if (ms < 1000) return `+${ms}ms`
  return `+${(ms / 1000).toFixed(1)}s`
}

function truncate(str, n = 100) {
  if (!str) return ""
  const s = typeof str === "string" ? str : JSON.stringify(str)
  return s.length > n ? s.slice(0, n) + "…" : s
}

// ─── Token pill ───────────────────────────────────────────────────────────────
function TokenPill({ tokens }) {
  if (!tokens) return null
  const total = tokens.total_tokens ?? (tokens.input_tokens ?? 0) + (tokens.output_tokens ?? 0)
  if (!total) return null
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono"
      style={{ background: "#7aa2f715", color: "#7aa2f7aa", border: "1px solid #7aa2f720" }}
    >
      <Coins size={7} />
      {total.toLocaleString()}
      {tokens.input_tokens != null && tokens.output_tokens != null && (
        <span className="opacity-60 ml-0.5">
          ({tokens.input_tokens}↑ {tokens.output_tokens}↓)
        </span>
      )}
    </span>
  )
}

// ─── Lifecycle step row ───────────────────────────────────────────────────────
function LifecycleEntry({ entry, index, total, prevEntry }) {
  const meta  = LIFECYCLE_META[entry.kind] ?? { icon: Cpu, color: "#a9b1d6", defaultLabel: entry.label }
  const Icon  = meta.icon
  const color = meta.color
  const isRunning = entry.status === "running"
  const isDone    = entry.status === "done"

  // Route badge inside classify step
  const routeKey   = entry.meta?.route
  const routeLabel = routeKey ? (ROUTE_LABELS[routeKey] ?? routeKey) : null
  const routeColor = routeKey ? (ROUTE_COLORS[routeKey] ?? "#a9b1d6") : color

  // Token info inside llm_call / finalize step
  const tokenInfo = entry.meta?.tokens ?? null

  // Delta since previous step
  const deltaMs = prevEntry ? entry.startedAt - prevEntry.startedAt : null
  const formattedDelta = deltaMs != null ? fmtDelta(deltaMs) : null

  return (
    <div className="flex gap-4 relative min-h-[3rem] group">
      {/* Left: Timeline lines and Icon */}
      <div className="relative flex flex-col items-center shrink-0 w-8">
        {/* Top line segment */}
        {index > 0 && (
          <div
            className="absolute top-0 bottom-1/2 w-[2px] -translate-x-1/2 left-1/2"
            style={{ backgroundColor: `${color}25` }}
          />
        )}
        {/* Bottom line segment */}
        {index < total - 1 && (
          <div
            className="absolute top-1/2 bottom-0 w-[2px] -translate-x-1/2 left-1/2"
            style={{ backgroundColor: `${color}25` }}
          />
        )}

        {/* Icon Container */}
        <div
          className="relative z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 bg-editor-bg"
          style={{
            background: isRunning ? `${color}15` : `${color}08`,
            border: `1px solid ${isRunning ? color : color + "30"}`,
            boxShadow: isRunning ? `0 0 8px ${color}20` : "none"
          }}
        >
          {isRunning ? (
            <Loader2 size={12} className="animate-spin" style={{ color }} />
          ) : (
            <Icon size={12} style={{ color }} />
          )}

          {/* Pulse ping ring for running step */}
          {isRunning && (
            <span
              className="absolute inset-0 rounded-lg animate-ping opacity-45 pointer-events-none"
              style={{
                background: `${color}30`,
                animationDuration: "1.6s"
              }}
            />
          )}
        </div>
      </div>

      {/* Right: Glassmorphic Content Card */}
      <div
        className="flex-1 p-3 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300 relative flex flex-col gap-1 min-w-0"
        style={{
          background: isRunning
            ? `linear-gradient(90deg, ${color}08, transparent)`
            : "rgba(255, 255, 255, 0.01)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Label */}
          <span className="text-[12px] font-semibold text-white/90 truncate flex-1 min-w-0">
            {entry.label}
          </span>

          {/* Delta since previous step */}
          {formattedDelta && (
            <span className="shrink-0 text-[10px] font-mono text-editor-muted/40" title="Time elapsed since previous step">
              {formattedDelta}
            </span>
          )}

          {/* Duration */}
          {entry.durationMs != null && (
            <span
              className="shrink-0 flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ color, background: color + "10", border: `1px solid ${color}20` }}
            >
              <Clock size={8} />
              {fmtDuration(entry.durationMs)}
            </span>
          )}

          {/* Status Icon */}
          <span className="shrink-0">
            {isRunning ? (
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }}></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: color }}></span>
              </span>
            ) : (
              <CheckCircle2 size={12} className="text-green-400" />
            )}
          </span>
        </div>

        {/* Route & Token details in card body */}
        {(routeLabel || tokenInfo) && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {routeLabel && isDone && (
              <span
                className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: routeColor + "18", color: routeColor, border: `1px solid ${routeColor}30` }}
              >
                {routeLabel}
              </span>
            )}
            {isDone && tokenInfo && (
              <>
                <TokenPill tokens={tokenInfo} />
                {tokenInfo.model && (
                  <span className="text-[9px] font-mono text-editor-muted/50 truncate">
                    {tokenInfo.model}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Running skeleton bar */}
        {isRunning && (
          <div className="w-full mt-1.5">
            <div className="skeleton-bar h-[3px] rounded-full" style={{ width: "55%" }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tool call row ────────────────────────────────────────────────────────────
function ToolEntry({ entry, index, total, prevEntry }) {
  const { icon: Icon, color, label } = getToolMeta(entry.tool)
  const isRunning = entry.status === "running"
  const isError   = entry.status === "error"
  const isDone    = entry.status === "done"

  const [isExpanded, setIsExpanded] = useState(false)

  // Detect command tools for extra styling
  const isCmd = ["run_command", "run_background_command", "send_command_input"].includes(entry.tool)

  const inputPreview = (() => {
    const inp = entry.input
    if (!inp || Object.keys(inp).length === 0) return null
    // For command tools, try to show the command string
    const cmdVal = inp.command || inp.cmd || inp.CommandLine
    if (cmdVal && typeof cmdVal === "string") return truncate(cmdVal, 90)
    const firstValue = Object.values(inp).find(v => typeof v === "string")
    return firstValue ? truncate(firstValue, 80) : truncate(JSON.stringify(inp), 80)
  })()

  // Delta since previous step
  const deltaMs = prevEntry ? entry.startedAt - prevEntry.startedAt : null
  const formattedDelta = deltaMs != null ? fmtDelta(deltaMs) : null

  const hasDetails = (entry.input && Object.keys(entry.input).length > 0) || entry.output

  return (
    <div className="flex gap-4 relative min-h-[3rem] group">
      {/* Left: Timeline lines and Icon */}
      <div className="relative flex flex-col items-center shrink-0 w-8">
        {/* Top line segment */}
        {index > 0 && (
          <div
            className="absolute top-0 bottom-1/2 w-[2px] -translate-x-1/2 left-1/2"
            style={{ backgroundColor: `${color}25` }}
          />
        )}
        {/* Bottom line segment */}
        {index < total - 1 && (
          <div
            className="absolute top-1/2 bottom-0 w-[2px] -translate-x-1/2 left-1/2"
            style={{ backgroundColor: `${color}25` }}
          />
        )}

        {/* Icon Container */}
        <div
          className="relative z-10 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 bg-editor-bg"
          style={{
            background: isRunning ? `${color}15` : `${color}08`,
            border: `1px solid ${isRunning ? color : color + "30"}`,
            boxShadow: isRunning ? `0 0 8px ${color}20` : "none"
          }}
        >
          <Icon size={12} style={{ color }} />

          {/* Pulse ping ring for running step */}
          {isRunning && (
            <span
              className="absolute inset-0 rounded-lg animate-ping opacity-45 pointer-events-none"
              style={{
                background: `${color}30`,
                animationDuration: "1.6s"
              }}
            />
          )}
        </div>
      </div>

      {/* Right: Glassmorphic Content Card */}
      <div
        onClick={hasDetails ? () => setIsExpanded(!isExpanded) : undefined}
        className={`flex-1 p-3 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300 relative flex flex-col gap-1 min-w-0 ${
          hasDetails ? "cursor-pointer select-none" : ""
        }`}
        style={{
          background: isRunning
            ? `linear-gradient(90deg, ${color}08, transparent)`
            : isError
            ? "rgba(247, 118, 142, 0.02)"
            : "rgba(255, 255, 255, 0.01)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Label */}
          <span className="text-[12px] font-semibold text-white/90 truncate flex-1 min-w-0">
            {label}
            {isRunning && isCmd && (
              <span className="ml-1.5 text-[9px] font-mono text-purple-400/70 animate-pulse">
                running…
              </span>
            )}
          </span>

          {/* Delta since previous step */}
          {formattedDelta && (
            <span className="shrink-0 text-[10px] font-mono text-editor-muted/40" title="Time elapsed since previous step">
              {formattedDelta}
            </span>
          )}

          {/* Duration */}
          {entry.durationMs != null && (
            <span
              className="shrink-0 flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ color, background: color + "10", border: `1px solid ${color}20` }}
            >
              <Clock size={8} />
              {fmtDuration(entry.durationMs)}
            </span>
          )}

          {/* Status Icon */}
          <span className="shrink-0">
            {isRunning ? (
              <Loader2 size={12} className="animate-spin" style={{ color }} />
            ) : isError ? (
              <XCircle size={12} className="text-red-400" />
            ) : (
              <CheckCircle2 size={12} className="text-green-400" />
            )}
          </span>

          {/* Expand/Collapse chevron */}
          {hasDetails && (
            <span className="shrink-0 text-editor-muted/40 group-hover:text-editor-text transition-colors ml-0.5">
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          )}
        </div>

        {/* Collapsed input preview */}
        {!isExpanded && inputPreview && (
          <div className="text-[10px] text-editor-muted/70 font-mono truncate leading-relaxed">
            {inputPreview}
          </div>
        )}

        {/* Expanded code blocks */}
        {isExpanded && (
          <div
            className="mt-2.5 flex flex-col gap-2 animate-in slide-in-from-top-1 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {entry.input && Object.keys(entry.input).length > 0 && (
              <div className="p-2 rounded-lg bg-black/45 border border-white/[0.03] font-mono text-[10px]">
                <div className="text-[9px] uppercase tracking-wider text-editor-muted/50 mb-1">Arguments</div>
                <pre className="overflow-x-auto whitespace-pre-wrap max-h-48 scrollbar-thin text-editor-text">{JSON.stringify(entry.input, null, 2)}</pre>
              </div>
            )}
            {entry.output && (
              <div className="p-2 rounded-lg bg-black/60 border border-white/[0.03] font-mono text-[10px]">
                <div className="text-[9px] uppercase tracking-wider text-editor-muted/50 mb-1">Output</div>
                <pre className="overflow-x-auto whitespace-pre-wrap max-h-48 scrollbar-thin text-white/85">{entry.output}</pre>
              </div>
            )}
          </div>
        )}

        {/* Running skeleton bar */}
        {isRunning && (
          <div className="w-full mt-1.5">
            <div className="skeleton-bar h-[3px] rounded-full" style={{ width: "60%" }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Unified entry dispatcher ─────────────────────────────────────────────────
function TraceEntry({ entry, index, total, prevEntry }) {
  if (entry.type === "lifecycle") {
    return <LifecycleEntry entry={entry} index={index} total={total} prevEntry={prevEntry} />
  }
  return <ToolEntry entry={entry} index={index} total={total} prevEntry={prevEntry} />
}

// ─── Collapsible Dropdown ─────────────────────────────────────────────────────
export default function ActivityDropdown({ entries, isLive }) {
  const [isOpen, setIsOpen] = useState(isLive)

  useEffect(() => {
    if (isLive) setIsOpen(true)
  }, [entries.length, isLive])

  if (!entries || entries.length === 0) return null

  const runningCount = entries.filter(e => e.status === "running").length
  const errorCount   = entries.filter(e => e.status === "error").length
  const doneCount    = entries.filter(e => e.status === "done").length

  // Compute total tokens across all finalize / llm_call lifecycle entries
  const totalTokens = entries.reduce((acc, e) => {
    if (e.type === "lifecycle" && e.meta?.tokens?.total_tokens) {
      return acc + e.meta.tokens.total_tokens
    }
    return acc
  }, 0)

  const getHeaderIcon = () => {
    if (isLive) return (
      <div className="relative shrink-0 flex items-center justify-center w-4 h-4">
        <span
          className="absolute inset-0 rounded-full animate-ping bg-blue-500/30"
          style={{ animationDuration: "1.4s" }}
        />
        <Loader2 size={12} className="animate-spin text-blue-400" />
      </div>
    )
    if (errorCount > 0) return <XCircle size={14} className="text-red-400 shrink-0" />
    return <CheckCircle2 size={14} className="text-green-400 shrink-0" />
  }

  return (
    <div className="my-3 self-start w-full max-w-[92%]">
      {/* Glassmorphic Dropdown Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] backdrop-blur-md rounded-xl transition-all duration-300 shadow-md text-left group"
      >
        {getHeaderIcon()}

        <span className="text-[11px] font-bold uppercase tracking-wider text-editor-muted group-hover:text-white transition-colors">
          {isLive ? "Agent Executing…" : "Agent Activity"}
        </span>

        <span className="text-[10px] text-editor-muted/60 font-mono">
          ({entries.length} {entries.length === 1 ? "step" : "steps"})
        </span>

        {/* Token summary pill */}
        {totalTokens > 0 && (
          <span
            className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded-full"
            style={{ background: "#7aa2f710", color: "#7aa2f780", border: "1px solid #7aa2f720" }}
          >
            <Coins size={8} />
            {totalTokens.toLocaleString()} tokens
          </span>
        )}

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

      {/* Glassmorphic Timeline Wrapper */}
      {isOpen && (
        <div className="relative flex flex-col gap-3 mt-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.01] backdrop-blur-xl shadow-xl shadow-black/20 animate-in fade-in duration-200">
          {entries.map((entry, i) => (
            <TraceEntry
              key={entry.id}
              entry={entry}
              index={i}
              total={entries.length}
              prevEntry={entries[i - 1]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

