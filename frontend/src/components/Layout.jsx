import { useState } from "react"
import FileTree    from "./FileTree"
import EditorTabs  from "./EditorTabs"
import CodeEditor  from "./CodeEditor"
import ChatPanel   from "./ChatPanel"
import Terminal    from "./Terminal"
import GitPanel    from "./GitPanel"
import {
  PanelLeftClose, PanelLeftOpen,
  MessageSquare, Terminal as TermIcon,
  GitBranch
} from "lucide-react"

export default function Layout() {
  const [sidebarTab,  setSidebarTab]  = useState("files")  // "files" | "git"
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatOpen,    setChatOpen]    = useState(true)
  const [termOpen,    setTermOpen]    = useState(true)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-editor-bg text-editor-text">

      {/* Left sidebar */}
      {sidebarOpen && (
        <div className="w-56 shrink-0 bg-editor-sidebar border-r border-editor-border flex flex-col">
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
            <div className="h-48 shrink-0 border-t border-editor-border flex flex-col">
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
          )}
        </div>
      </div>

      {/* Right chat panel */}
      {chatOpen && (
        <div className="w-80 shrink-0">
          <ChatPanel />
        </div>
      )}
    </div>
  )
}