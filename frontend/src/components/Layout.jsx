import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useProjectStore } from "../stores/projectStore"
import FileTree   from "./FileTree"
import EditorTabs from "./EditorTabs"
import CodeEditor from "./CodeEditor"
import ChatPanel  from "./ChatPanel"
import { PanelLeftClose, PanelLeftOpen, MessageSquare } from "lucide-react"

export default function Layout() {
  const navigate  = useNavigate()
  const project   = useProjectStore((s) => s.activeProject)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatOpen,    setChatOpen]    = useState(true)

  // Redirect to project picker if no active project (e.g. page refresh cleared store)
  if (!project) {
    navigate("/projects", { replace: true })
    return null
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-editor-bg text-editor-text">

      {/* Sidebar — file tree */}
      {sidebarOpen && (
        <div className="w-56 shrink-0 bg-editor-sidebar border-r border-editor-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border">
            <span className="text-xs text-editor-muted uppercase tracking-wider">Explorer</span>
            <PanelLeftClose
              size={14}
              className="cursor-pointer text-editor-muted hover:text-editor-text"
              onClick={() => setSidebarOpen(false)}
            />
          </div>
          <FileTree />
        </div>
      )}

      {/* Main area — tabs + editor */}
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
          <EditorTabs />
          <div className="ml-auto">
            <MessageSquare
              size={16}
              className="cursor-pointer text-editor-muted hover:text-editor-text"
              onClick={() => setChatOpen((o) => !o)}
            />
          </div>
        </div>
        <CodeEditor />
      </div>

      {/* Chat panel */}
      {chatOpen && (
        <div className="w-80 shrink-0">
          <ChatPanel />
        </div>
      )}
    </div>
  )
}