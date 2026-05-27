import { useState, useEffect } from "react"
import FileTree    from "./FileTree"
import EditorTabs  from "./EditorTabs"
import CodeEditor  from "./CodeEditor"
import ChatPanel   from "./ChatPanel"
import Terminal    from "./Terminal"
import GitPanel    from "./GitPanel"
import StatusBar from "./StatusBar"
import { useTerminalStore } from "../stores/terminalStore"
import { useProjectStore } from "../stores/projectStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import {
  PanelLeftClose, PanelLeftOpen,
  MessageSquare, Terminal as TermIcon,
  GitBranch, Plus, Maximize2, Minimize2, ChevronDown
} from "lucide-react"

export default function Layout() {
  const [sidebarTab,  setSidebarTab]  = useState("files")  // "files" | "git"
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatOpen,    setChatOpen]    = useState(true)
  
  const [sidebarWidth, setSidebarWidth] = useState(224) // default 224px
  const [chatWidth, setChatWidth]       = useState(320) // default 320px
  const [termHeight, setTermHeight]     = useState(192) // default 192px

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

  const { connect, disconnect } = useAgentSocket(project?.id)

  useEffect(() => {
    if (project) connect()
    return () => disconnect()
  }, [project?.id, connect, disconnect])

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

      {/* Left sidebar */}
      {sidebarOpen && (
        <>
          <div 
            style={{ width: `${sidebarWidth}px` }}
            className="shrink-0 bg-editor-sidebar border-r border-editor-border flex flex-col"
          >
            {/* Sidebar tab switcher */}
            <div className="flex border-b border-editor-border">
              <button
                onClick={() => setSidebarTab("files")}
                className={`flex-1 flex items-center justify-center py-2 text-xs gap-1
                  ${sidebarTab === "files" ? "text-editor-text border-b-2 border-blue-500" : "text-editor-muted"}`}
              >
                <PanelLeftOpen size={12} /> Files
              </button>
              <button
                onClick={() => setSidebarTab("git")}
                className={`flex-1 flex items-center justify-center py-2 text-xs gap-1
                  ${sidebarTab === "git" ? "text-editor-text border-b-2 border-blue-500" : "text-editor-muted"}`}
              >
                <GitBranch size={12} /> Git
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
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
        <div className="flex items-center h-9 bg-editor-sidebar border-b border-editor-border px-2 gap-2">
          {!sidebarOpen && (
            <PanelLeftOpen
              size={16}
              className="cursor-pointer text-editor-muted hover:text-editor-text"
              onClick={() => setSidebarOpen(true)}
            />
          )}
          {sidebarOpen && (
            <PanelLeftClose
              size={16}
              className="cursor-pointer text-editor-muted hover:text-editor-text"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <EditorTabs />
          <div className="ml-auto flex items-center gap-3">
            <TermIcon
              size={15}
              className="cursor-pointer text-editor-muted hover:text-editor-text"
              onClick={() => setTermOpen((o) => !o)}
            />
            <MessageSquare
              size={15}
              className="cursor-pointer text-editor-muted hover:text-editor-text"
              onClick={() => setChatOpen((o) => !o)}
            />
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
            <div className="flex items-center px-3 bg-editor-sidebar border-b border-editor-border shrink-0 select-none h-8">
              <div className="flex items-center gap-1.5 border-r border-editor-border pr-2.5 shrink-0">
                <TermIcon size={12} className="text-editor-muted" />
                <span className="text-[10px] text-editor-muted font-bold uppercase tracking-wider font-mono">Terminal</span>
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
            className="shrink-0"
          >
            <ChatPanel />
          </div>
        </>
      )}

      <StatusBar />
    </div>
  )
}