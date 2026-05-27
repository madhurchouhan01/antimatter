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
  GitBranch
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
  
  const { connect, disconnect } = useAgentSocket(project?.id)

  useEffect(() => {
    if (project) connect()
    return () => disconnect()
  }, [project?.id, connect, disconnect])

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
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <CodeEditor />
          </div>

          {termOpen && (
            <>
              {/* Horizontal Resizer Handle */}
              <div 
                className="h-1 cursor-row-resize hover:bg-blue-500/40 active:bg-blue-500 transition-colors shrink-0 z-10 bg-editor-border/30 hover:h-[6px] -mt-[2px] -mb-[2px]"
                onMouseDown={handleTermMouseDown}
              />
              <div 
                style={{ height: `${termHeight}px` }}
                className="shrink-0 border-t border-editor-border flex flex-col"
              >
                <div className="flex items-center gap-2 px-3 py-1 bg-editor-sidebar border-b border-editor-border shrink-0">
                  <TermIcon size={12} className="text-editor-muted" />
                  <span className="text-xs text-editor-muted">Terminal</span>
                  <button
                    onClick={() => setTermOpen(false)}
                    className="ml-auto text-editor-muted hover:text-editor-text text-xs"
                  >✕</button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Terminal />
                </div>
              </div>
            </>
          )}
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