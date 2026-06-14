import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import FileTree    from "./FileTree"
import EditorTabs  from "./EditorTabs"
import CodeEditor  from "./CodeEditor"
import ChatPanel   from "./ChatPanel"
import Terminal    from "./Terminal"
import GitPanel    from "./GitPanel"
import IndexingNotification from "./IndexingNotification"
import GlobalDiffPanel from "./GlobalDiffPanel"
import ShortcutsOverlay from "./ShortcutsOverlay"
import SettingsModal from "./SettingsModal"
import { useShortcuts } from "../hooks/useShortcuts"
import { useTerminalStore } from "../stores/terminalStore"
import { useProjectStore } from "../stores/projectStore"
import { useAuthStore } from "../stores/authStore"
import { useSettingsStore } from "../stores/settingsStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import {
  PanelLeftClose, PanelLeftOpen,
  MessageSquare, Terminal as TermIcon,
  GitBranch, Plus, Maximize2, Minimize2, ChevronDown, LogOut, Settings
} from "lucide-react"

export default function Layout() {
  const [sidebarTab,  setSidebarTab]  = useState("files")  // "files" | "git"
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatOpen,    setChatOpen]    = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  
  const [sidebarWidth, setSidebarWidth] = useState(280) // default 280px
  const [chatWidth, setChatWidth]       = useState(380) // default 380px
  const [termHeight, setTermHeight]     = useState(192) // default 192px
  const [showShortcuts, setShowShortcuts] = useState(false)

  const fetchSettings = useSettingsStore((s) => s.fetchSettings)

  const termOpen = useTerminalStore((s) => s.termOpen)
  const setTermOpen = useTerminalStore((s) => s.setTermOpen)
  const project = useProjectStore((s) => s.activeProject)
  
  const sessions = useTerminalStore((s) => s.sessions)
  const activeSession = useTerminalStore((s) => s.activeSession)
  const addSession = useTerminalStore((s) => s.addSession)
  const removeSession = useTerminalStore((s) => s.removeSession)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const termFullscreen = useTerminalStore((s) => s.termFullscreen)
  const setTermFullscreen = useTerminalStore((s) => s.setTermFullscreen)

  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate = useNavigate()

  const { connect, disconnect } = useAgentSocket(project?.id)

  useEffect(() => {
    if (project) connect()
    return () => disconnect()
  }, [project?.id, connect, disconnect])

  // Load user's AI settings from backend on mount
  useEffect(() => {
    fetchSettings()
  }, [])

  // Bind global shortcuts
  useShortcuts({
    toggleSidebar: () => setSidebarOpen(prev => !prev),
    toggleChat: () => setChatOpen(prev => !prev),
    toggleTerminal: () => setTermOpen(!termOpen),
    setSidebarTab,
    openShortcutsHelp: () => setShowShortcuts(true),
    closeShortcutsHelp: () => setShowShortcuts(false),
  })

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      clearAuth()
      navigate("/login")
    }
  }

  const handleAddTerminal = () => {
    const nextNum = sessions.length + 1
    const newId = `term-${Date.now()}`
    addSession({
      id: newId,
      name: `bash ${nextNum}`
    })
  }

  const handleSidebarMouseDown = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX
      setSidebarWidth(Math.max(150, Math.min(500, startWidth + deltaX)))
    }
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  const handleChatMouseDown = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = chatWidth
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX
      setChatWidth(Math.max(200, Math.min(600, startWidth - deltaX)))
    }
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  const handleTermMouseDown = (e) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = termHeight
    const handleMouseMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY
      setTermHeight(Math.max(80, Math.min(500, startHeight - deltaY)))
    }
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-editor-bg text-editor-text">
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      
      {/* Left sidebar */}
      {sidebarOpen && (
        <>
          <div
            style={{ width: `${sidebarWidth}px` }}
            className="shrink-0 bg-editor-sidebar/95 backdrop-blur-xl border-r border-editor-border/50 flex flex-col shadow-xl z-20 relative"
          >
            {/* Sidebar tab switcher */}
            <div className="flex border-b border-editor-border/50 bg-editor-sidebar">
              <button
                onClick={() => setSidebarTab("files")}
                className={`flex-1 flex items-center justify-center py-2.5 text-xs font-semibold uppercase tracking-wider gap-1.5 transition-colors
                  ${sidebarTab === "files" ? "text-editor-accent border-b-[3px] border-editor-accent bg-editor-highlight/30" : "text-editor-muted hover:bg-editor-highlight/50 border-b-[3px] border-transparent"}`}
              >
                <PanelLeftOpen size={14} /> Files
              </button>
              <button
                onClick={() => setSidebarTab("git")}
                className={`flex-1 flex items-center justify-center py-2.5 text-xs font-semibold uppercase tracking-wider gap-1.5 transition-colors
                  ${sidebarTab === "git" ? "text-editor-accent border-b-[3px] border-editor-accent bg-editor-highlight/30" : "text-editor-muted hover:bg-editor-highlight/50 border-b-[3px] border-transparent"}`}
              >
                <GitBranch size={14} /> Git
              </button>
            </div>

            <GlobalDiffPanel />

            <div className="flex-1 overflow-hidden flex flex-col">
              {sidebarTab === "files" ? <FileTree /> : <GitPanel />}
            </div>
          </div>
          {/* Vertical Resizer Handle */}
          <div 
            className="w-1 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500 transition-colors shrink-0 z-10 bg-editor-border/30 hover:w-[6px] -ml-[2px] -mr-[2px]"
            onMouseDown={handleSidebarMouseDown}
          />
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <div className="flex items-center h-12 bg-editor-sidebar/90 backdrop-blur-md border-b border-editor-border/50 px-4 gap-3 shadow-sm z-10 relative">
          {!sidebarOpen && (
            <button 
              className="p-1.5 rounded-md hover:bg-editor-highlight/50 text-editor-muted hover:text-editor-text transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          {sidebarOpen && (
            <button 
              className="p-1.5 rounded-md hover:bg-editor-highlight/50 text-editor-muted hover:text-editor-text transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose size={16} />
            </button>
          )}
          <EditorTabs />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setTermOpen((o) => !o)}
              title="Toggle Terminal"
              className={`p-2 rounded-lg transition-all ${termOpen ? 'bg-editor-accent/20 text-editor-accent shadow-inner' : 'text-editor-muted hover:bg-editor-highlight hover:text-editor-text'}`}
            >
              <TermIcon size={16} />
            </button>
            <button
              onClick={() => setChatOpen((o) => !o)}
              title="Toggle AI Chat"
              className={`p-2 rounded-lg transition-all ${chatOpen ? 'bg-editor-accent/20 text-editor-accent shadow-inner' : 'text-editor-muted hover:bg-editor-highlight hover:text-editor-text'}`}
            >
              <MessageSquare size={16} />
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              title="AI Settings"
              className="p-2 rounded-lg transition-all text-editor-muted hover:bg-editor-highlight hover:text-editor-text"
            >
              <Settings size={16} />
            </button>
            
            <div className="w-[1px] h-5 bg-editor-border/50 mx-2"></div>
            
            <button
              onClick={handleLogout}
              className="group flex items-center gap-1.5 px-3 py-1.5 bg-editor-bg hover:bg-red-500/10 border border-editor-border/50 hover:border-red-500/30 rounded-lg text-editor-muted hover:text-red-400 transition-all shadow-sm hover:shadow-[0_0_12px_rgba(248,113,113,0.15)]"
              title="Log Out"
            >
              <LogOut size={14} className="group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-xs font-semibold tracking-wide uppercase hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Editor + Terminal split */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 flex flex-col overflow-hidden">
            <CodeEditor />
          </div>

          {/* Resizer Handle: Hide if terminal hidden or maximized */}
          {termOpen && !termFullscreen && (
            <div 
              className="h-1 cursor-row-resize hover:bg-blue-500/40 active:bg-blue-500 transition-colors shrink-0 z-10 bg-editor-border/30 hover:h-[6px] -mt-[2px] -mb-[2px]"
              onMouseDown={handleTermMouseDown}
            />
          )}

          {/* Terminal container: Toggled via display style (always mounted to avoid socket disconnects) */}
          <div 
            style={{ 
              height: termFullscreen ? "calc(100% - 9px)" : `${termHeight}px`,
              display: termOpen ? "flex" : "none"
            }}
            className={`shrink-0 border-t border-editor-border flex flex-col bg-[#12131a] ${
              termFullscreen ? "absolute inset-x-0 bottom-0 top-0 z-40" : ""
            }`}
          >
            {/* Tab/Actions Header */}
            <div className="flex items-center px-4 bg-editor-sidebar border-b border-editor-border/50 shrink-0 select-none h-9">
              <div className="flex items-center gap-2 border-r border-editor-border/50 pr-4 shrink-0">
                <TermIcon size={14} className="text-editor-accent" />
                <span className="text-[11px] text-editor-text font-bold uppercase tracking-widest font-mono">Terminal</span>
              </div>
              
              {/* Terminal tabs */}
              <div className="flex items-center gap-1 ml-2 overflow-x-auto scrollbar-none flex-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => setActiveSession(session.id)}
                    className={`flex items-center gap-2 px-2.5 h-8 text-[11px] border-r border-editor-border cursor-pointer transition-colors max-w-[120px] truncate shrink-0 ${
                      session.id === activeSession
                        ? "bg-[#12131a] text-blue-400 font-medium"
                        : "text-editor-muted hover:text-editor-text hover:bg-editor-highlight/40"
                    }`}
                  >
                    <span>{session.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSession(session.id)
                      }}
                      className="hover:text-red-400 p-[1px] rounded hover:bg-editor-highlight transition-colors text-[9px]"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {/* Add button */}
                <button
                  onClick={handleAddTerminal}
                  className="p-1 ml-1 text-editor-muted hover:text-editor-text hover:bg-editor-highlight/60 rounded transition-colors"
                  title="Create terminal session"
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* Window controls */}
              <div className="ml-auto flex items-center gap-2 pr-1 shrink-0">
                <button
                  onClick={() => setTermFullscreen(!termFullscreen)}
                  className="p-1 text-editor-muted hover:text-editor-text hover:bg-editor-highlight/60 rounded transition-colors"
                  title={termFullscreen ? "Restore pane" : "Maximize pane"}
                >
                  {termFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
                <button
                  onClick={() => setTermOpen(false)}
                  className="p-1 text-editor-muted hover:text-editor-text hover:bg-editor-highlight/60 rounded transition-colors"
                  title="Hide terminal"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            </div>

            {/* Viewport for all mounted terminals */}
            <div className="flex-1 overflow-hidden relative bg-[#12131a]">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  style={{ display: session.id === activeSession ? "block" : "none" }}
                  className="h-full w-full"
                >
                  <Terminal terminalId={session.id} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right chat panel */}
      {chatOpen && (
        <>
          {/* Vertical Resizer Handle */}
          <div 
            className="w-1 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500 transition-colors shrink-0 z-10 bg-editor-border/30 hover:w-[6px] -ml-[2px] -mr-[2px]"
            onMouseDown={handleChatMouseDown}
          />
          <div 
            style={{ width: `${chatWidth}px` }}
            className="shrink-0 h-full"
          >
            <ChatPanel />
          </div>
        </>
      )}

      <IndexingNotification />
    </div>
  )
}