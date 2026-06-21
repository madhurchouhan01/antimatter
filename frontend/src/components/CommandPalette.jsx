import { useState, useEffect, useRef, useCallback } from "react"
import {
  Search, File, Terminal as TermIcon, MessageSquare, GitBranch,
  CheckCircle2, XCircle, PlusSquare, Settings, Keyboard,
  ChevronRight, Zap, Activity, FolderOpen, Maximize2, RefreshCw,
  LogOut, LayoutDashboard
} from "lucide-react"
import { useEditorStore }   from "../stores/editorStore"
import { useProjectStore }  from "../stores/projectStore"
import { useDiffStore }     from "../stores/diffStore"
import { useChatStore }     from "../stores/chatStore"
import { useSettingsStore } from "../stores/settingsStore"
import { filesApi }         from "../lib/api"

// ─── Fuzzy match helper ────────────────────────────────────────────────────────
function fuzzyMatch(str, query) {
  if (!query) return true
  const s = str.toLowerCase()
  const q = query.toLowerCase()
  let si = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = s.indexOf(q[qi], si)
    if (idx === -1) return false
    si = idx + 1
  }
  return true
}

function highlightMatch(str, query) {
  if (!query) return str
  const q = query.toLowerCase()
  const result = []
  let i = 0
  for (const ch of q) {
    const idx = str.toLowerCase().indexOf(ch, i)
    if (idx === -1) break
    if (idx > i) result.push(<span key={`pre-${idx}`}>{str.slice(i, idx)}</span>)
    result.push(<span key={`m-${idx}`} className="text-blue-400 font-bold">{str[idx]}</span>)
    i = idx + 1
  }
  if (i < str.length) result.push(<span key="tail">{str.slice(i)}</span>)
  return result
}

// ─── Static command list ──────────────────────────────────────────────────────
function buildCommands({ toggleSidebar, toggleChat, toggleTerminal,
  setSidebarTab, openShortcutsHelp, openDashboard, project }) {
  return [
    {
      id: "new-chat",
      label: "New Chat",
      description: "Clear current conversation",
      icon: PlusSquare,
      color: "#7aa2f7",
      action: () => {
        useChatStore.getState().clearChat()
      },
    },
    {
      id: "toggle-sidebar",
      label: "Toggle Sidebar",
      description: "Show or hide file explorer",
      icon: FolderOpen,
      color: "#9ece6a",
      action: toggleSidebar,
      kbd: ["Ctrl", "B"],
    },
    {
      id: "toggle-terminal",
      label: "Toggle Terminal",
      description: "Show or hide terminal panel",
      icon: TermIcon,
      color: "#bb9af7",
      action: toggleTerminal,
      kbd: ["Ctrl", "J"],
    },
    {
      id: "toggle-chat",
      label: "Toggle AI Chat",
      description: "Show or hide AI assistant panel",
      icon: MessageSquare,
      color: "#7dcfff",
      action: toggleChat,
      kbd: ["Ctrl", "\\"],
    },
    {
      id: "sidebar-files",
      label: "Go to Files",
      description: "Switch sidebar to file explorer",
      icon: FolderOpen,
      color: "#9ece6a",
      action: () => setSidebarTab("files"),
      kbd: ["Ctrl", "Shift", "E"],
    },
    {
      id: "sidebar-git",
      label: "Go to Git",
      description: "Switch sidebar to Git panel",
      icon: GitBranch,
      color: "#f7768e",
      action: () => setSidebarTab("git"),
      kbd: ["Ctrl", "Shift", "G"],
    },
    {
      id: "accept-diffs",
      label: "Accept All Diffs",
      description: "Accept all pending file changes",
      icon: CheckCircle2,
      color: "#9ece6a",
      action: async () => {
        if (!project) return
        const { pendingDiffs, agentDone, clearAll } = useDiffStore.getState()
        if (!agentDone) return
        const { updateContent, markSaved } = useEditorStore.getState()
        for (const [path, diff] of Object.entries(pendingDiffs)) {
          try { await filesApi.write(project.id, path, diff.modified); updateContent(path, diff.modified); markSaved(path) } catch {}
        }
        clearAll()
      },
      kbd: ["Ctrl", "Shift", "A"],
    },
    {
      id: "reject-diffs",
      label: "Reject All Diffs",
      description: "Dismiss all pending file changes",
      icon: XCircle,
      color: "#f7768e",
      action: () => {
        const { agentDone, clearAll } = useDiffStore.getState()
        if (agentDone) clearAll()
      },
      kbd: ["Ctrl", "Shift", "R"],
    },
    {
      id: "shortcuts",
      label: "Keyboard Shortcuts",
      description: "Show all keyboard shortcuts",
      icon: Keyboard,
      color: "#7aa2f7",
      action: openShortcutsHelp,
      kbd: ["Ctrl", "Shift", "H"],
    },
    {
      id: "settings",
      label: "AI Settings",
      description: "Configure model and API keys",
      icon: Settings,
      color: "#ff9e64",
      action: () => useSettingsStore.getState().setSettingsOpen(true),
    },
    {
      id: "dashboard",
      label: "Workspace Dashboard",
      description: "Show workspace health and stats",
      icon: LayoutDashboard,
      color: "#73daca",
      action: openDashboard,
      kbd: ["Ctrl", "Shift", "D"],
    },
    {
      id: "maximize-terminal",
      label: "Terminal Fullscreen",
      description: "Toggle terminal fullscreen mode",
      icon: Maximize2,
      color: "#bb9af7",
      action: () => {
        const { termFullscreen, setTermFullscreen } = require("../stores/terminalStore").useTerminalStore.getState()
        setTermFullscreen(!termFullscreen)
      },
      kbd: ["Ctrl", "Shift", "F"],
    },
  ]
}

// ─── Kbd chip ─────────────────────────────────────────────────────────────────
function Kbd({ children }) {
  return (
    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded
      bg-editor-bg border border-editor-border/70 text-editor-muted/70
      font-mono text-[10px] shadow-[0_1px_0_0] shadow-editor-border/30 min-w-[22px] text-center">
      {children}
    </span>
  )
}

// ─── Main palette ─────────────────────────────────────────────────────────────
export default function CommandPalette({
  onClose,
  toggleSidebar,
  toggleChat,
  toggleTerminal,
  setSidebarTab,
  openShortcutsHelp,
  openDashboard,
}) {
  const project   = useProjectStore((s) => s.activeProject)
  const openFile  = useEditorStore((s) => s.openFile)

  const [query,   setQuery]   = useState("")
  const [files,   setFiles]   = useState([])
  const [cursor,  setCursor]  = useState(0)
  const inputRef  = useRef(null)
  const listRef   = useRef(null)

  const commands = buildCommands({
    toggleSidebar, toggleChat, toggleTerminal,
    setSidebarTab, openShortcutsHelp, openDashboard, project,
  })

  // Load files on open
  useEffect(() => {
    if (!project) return
    filesApi.list(project.id).then(r => {
      const flatFiles = []
      const flatten = (nodes) => {
        for (const n of nodes) {
          if (!n.is_dir) flatFiles.push(n)
          else if (n.children) flatten(n.children)
        }
      }
      flatten(r.data)
      setFiles(flatFiles)
    }).catch(() => {})
    inputRef.current?.focus()
  }, [project])

  // Filter
  const filteredFiles = files
    .filter(f => fuzzyMatch(f.name, query))
    .slice(0, 8)

  const filteredCommands = commands
    .filter(c => fuzzyMatch(c.label, query) || fuzzyMatch(c.description, query))

  const allItems = [
    ...(query ? [] : [{ type: "header", label: "Files" }]),
    ...filteredFiles.map(f => ({ type: "file", ...f })),
    ...(filteredFiles.length > 0 ? [{ type: "divider" }] : []),
    ...(query ? [] : [{ type: "header", label: "Commands" }]),
    ...filteredCommands.map(c => ({ type: "command", ...c })),
  ].filter(i => i.type !== "header" || true) // keep headers always

  const selectableItems = allItems.filter(i => i.type === "file" || i.type === "command")

  const execute = useCallback((item) => {
    if (item.type === "file") {
      filesApi.read(project.id, item.path).then(r => {
        openFile(item.path, r.data.content)
      }).catch(() => {})
      onClose()
    } else if (item.type === "command") {
      item.action?.()
      onClose()
    }
  }, [project, openFile, onClose])

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") { onClose(); return }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, selectableItems.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (selectableItems[cursor]) execute(selectableItems[cursor])
    }
  }, [cursor, selectableItems, execute, onClose])

  // Keep cursor in bounds when filter changes
  useEffect(() => { setCursor(0) }, [query])

  // Scroll cursor into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  let selectableIdx = -1

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center pt-[12vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-[580px] mx-4 rounded-2xl overflow-hidden
          shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
        style={{
          background: "linear-gradient(135deg, rgba(22,23,32,0.97) 0%, rgba(18,19,28,0.99) 100%)",
          border: "1px solid rgba(122,162,247,0.18)",
          backdropFilter: "blur(24px)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-editor-border/40">
          <Search size={15} className="text-editor-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files or commands…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-white text-[13px] outline-none placeholder:text-editor-muted/50"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-editor-muted hover:text-white transition-colors">
              <XCircle size={14} />
            </button>
          )}
          <Kbd>Esc</Kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[420px] overflow-y-auto py-2 scrollbar-thin">
          {allItems.map((item, i) => {
            if (item.type === "header") {
              return (
                <div key={`h-${item.label}`} className="px-4 pt-2 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-editor-muted/50">
                    {item.label}
                  </span>
                </div>
              )
            }
            if (item.type === "divider") {
              return <div key={`div-${i}`} className="my-1 mx-4 border-t border-editor-border/25" />
            }

            selectableIdx++
            const idx = selectableIdx
            const isActive = cursor === idx

            if (item.type === "file") {
              const Icon = File
              return (
                <button
                  key={item.path}
                  data-idx={idx}
                  onClick={() => execute(item)}
                  onMouseEnter={() => setCursor(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive ? "bg-blue-500/12 text-white" : "text-editor-muted/80 hover:text-white"
                  }`}
                >
                  <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isActive ? "bg-blue-500/20" : "bg-editor-highlight/40"
                  }`}>
                    <Icon size={13} className={isActive ? "text-blue-400" : "text-editor-muted"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {highlightMatch(item.name, query)}
                    </div>
                    <div className="text-[10px] text-editor-muted/50 truncate font-mono">{item.path}</div>
                  </div>
                  {isActive && <ChevronRight size={12} className="text-blue-400 shrink-0" />}
                </button>
              )
            }

            if (item.type === "command") {
              const Icon = item.icon ?? Zap
              return (
                <button
                  key={item.id}
                  data-idx={idx}
                  onClick={() => execute(item)}
                  onMouseEnter={() => setCursor(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive ? "bg-blue-500/12 text-white" : "text-editor-muted/80 hover:text-white"
                  }`}
                >
                  <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: item.color + "18", border: `1px solid ${item.color}30` }}>
                    <Icon size={13} style={{ color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{highlightMatch(item.label, query)}</div>
                    <div className="text-[10px] text-editor-muted/50">{item.description}</div>
                  </div>
                  {item.kbd && (
                    <div className="flex items-center gap-1 shrink-0">
                      {item.kbd.map((k, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          <Kbd>{k}</Kbd>
                          {ki < item.kbd.length - 1 && <span className="text-editor-muted/30 text-[9px]">+</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              )
            }
            return null
          })}

          {selectableItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-editor-muted/40">
              <Search size={28} className="mb-2 opacity-40" />
              <span className="text-sm">No results for &ldquo;{query}&rdquo;</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-editor-border/25 bg-editor-bg/30">
          {[["↑↓", "Navigate"], ["↵", "Open"], ["Esc", "Close"]].map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <Kbd>{key}</Kbd>
              <span className="text-[10px] text-editor-muted/50">{label}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-1 text-[10px] text-editor-muted/30">
            <Activity size={9} />
            <span>{selectableItems.length} results</span>
          </div>
        </div>
      </div>
    </div>
  )
}
