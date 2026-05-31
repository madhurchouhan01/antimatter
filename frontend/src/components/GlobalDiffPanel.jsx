import { ChevronDown, Check, X, File } from "lucide-react"
import { useDiffStore } from "../stores/diffStore"
import { useProjectStore } from "../stores/projectStore"
import { useEditorStore } from "../stores/editorStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import { filesApi } from "../lib/api"
import { useState } from "react"

export default function GlobalDiffPanel() {
  const pendingDiffs = useDiffStore((s) => s.pendingDiffs)
  const removePendingDiff = useDiffStore((s) => s.removePendingDiff)
  const clearAll = useDiffStore((s) => s.clearAll)
  const { openFile, updateContent, markSaved } = useEditorStore()
  const project = useProjectStore((s) => s.activeProject)
  const { sendMessage } = useAgentSocket(project?.id)
  
  const [expanded, setExpanded] = useState(true)

  const entries = Object.entries(pendingDiffs)
  if (entries.length === 0) return null

  const handleAcceptAll = async () => {
    if (!project) return
    for (const [path, diff] of entries) {
      try {
        await filesApi.write(project.id, path, diff.modified)
        updateContent(path, diff.modified)
        markSaved(path)
        sendMessage(`SYSTEM: The user accepted the changes for ${path}.`, "llama-3.3-70b-versatile", { hidden: true })
      } catch (e) {
        console.error("Failed to accept diff for", path, e)
      }
    }
    clearAll()
  }

  const handleRejectAll = () => {
    for (const [path] of entries) {
      sendMessage(`SYSTEM: The user rejected the changes for ${path}.`, "llama-3.3-70b-versatile", { hidden: true })
    }
    clearAll()
  }

  const handleAcceptOne = async (e, path, diff) => {
    e.stopPropagation()
    if (!project) return
    try {
      await filesApi.write(project.id, path, diff.modified)
      updateContent(path, diff.modified)
      markSaved(path)
      removePendingDiff(path)
      sendMessage(`SYSTEM: The user accepted the changes for ${path}.`, "llama-3.3-70b-versatile", { hidden: true })
    } catch (err) {
      console.error("Failed to accept diff for", path, err)
    }
  }

  const handleRejectOne = (e, path) => {
    e.stopPropagation()
    removePendingDiff(path)
    sendMessage(`SYSTEM: The user rejected the changes for ${path}.`, "llama-3.3-70b-versatile", { hidden: true })
  }

  return (
    <div className="flex flex-col border-b border-editor-border/50 bg-[#12131a]">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-editor-highlight/40 transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className={`transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}>
            <ChevronDown size={14} className="text-editor-muted" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-editor-text">
            {entries.length} File{entries.length > 1 ? "s" : ""} With Changes
          </span>
        </div>
        
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <button 
            onClick={handleRejectAll}
            className="text-[11px] text-editor-muted hover:text-red-400 transition-colors font-medium px-2 py-0.5 rounded hover:bg-editor-highlight/50"
          >
            Reject all
          </button>
          <button 
            onClick={handleAcceptAll}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium px-2 py-0.5 rounded transition-colors"
          >
            Accept all
          </button>
        </div>
      </div>

      {/* File List */}
      {expanded && (
        <div className="flex flex-col py-1">
          {entries.map(([path, diff]) => {
            const filename = path.split("/").pop()
            return (
              <div 
                key={path}
                className="group flex items-center justify-between px-4 py-1.5 hover:bg-editor-highlight/40 cursor-pointer"
                onClick={() => openFile(path, diff.original)} // Opens the file in the editor to show the inline diff
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-[13px] text-editor-text truncate">{filename}</span>
                  <span className="text-[11px] text-editor-muted truncate ml-1">{path}</span>
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => handleRejectOne(e, path)}
                    className="p-1 hover:bg-editor-highlight rounded text-editor-muted hover:text-red-400"
                    title="Reject"
                  >
                    <X size={14} />
                  </button>
                  <button 
                    onClick={(e) => handleAcceptOne(e, path, diff)}
                    className="p-1 hover:bg-editor-highlight rounded text-editor-muted hover:text-blue-400"
                    title="Accept"
                  >
                    <Check size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
