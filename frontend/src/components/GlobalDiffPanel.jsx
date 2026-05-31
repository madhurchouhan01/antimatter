import { ChevronDown, Check, X, Eye, CheckCheck, Sparkles } from "lucide-react"
import { useDiffStore } from "../stores/diffStore"
import { useProjectStore } from "../stores/projectStore"
import { useEditorStore } from "../stores/editorStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import { filesApi } from "../lib/api"
import { useState } from "react"

export default function GlobalDiffPanel() {
  const pendingDiffs    = useDiffStore((s) => s.pendingDiffs)
  const agentDone       = useDiffStore((s) => s.agentDone)
  const reviewingFile   = useDiffStore((s) => s.reviewingFile)
  const removePendingDiff  = useDiffStore((s) => s.removePendingDiff)
  const clearAll           = useDiffStore((s) => s.clearAll)
  const setReviewingFile   = useDiffStore((s) => s.setReviewingFile)
  const { openFile, updateContent, markSaved } = useEditorStore()
  const project = useProjectStore((s) => s.activeProject)
  const { sendMessage } = useAgentSocket(project?.id)

  const [expanded, setExpanded] = useState(true)

  const entries = Object.entries(pendingDiffs)

  // Only render if there are diffs AND the agent has finished
  if (entries.length === 0 || !agentDone) return null

  const handleReviewFile = (path, diff) => {
    setReviewingFile(path)
    // Open the file with the original content so the DiffEditor can compare
    openFile(path, diff.original)
  }

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
    if (reviewingFile === path) setReviewingFile(null)
    removePendingDiff(path)
    sendMessage(`SYSTEM: The user rejected the changes for ${path}.`, "llama-3.3-70b-versatile", { hidden: true })
  }

  return (
    <div className="flex flex-col border-b border-editor-border/50">
      {/* "Task Complete" banner — shown when agent finishes with diffs */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border-b border-blue-500/20">
        <Sparkles size={12} className="text-blue-400 shrink-0" />
        <span className="text-[11px] text-blue-300 font-medium flex-1">
          Task complete — review {entries.length} proposed change{entries.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Collapsible file list */}
      <div className="bg-[#12131a]">
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-editor-highlight/30 transition-colors select-none"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <div className={`transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}>
              <ChevronDown size={13} className="text-editor-muted" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-editor-muted">
              {entries.length} file{entries.length > 1 ? "s" : ""} changed
            </span>
          </div>

          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <button
              onClick={handleRejectAll}
              className="text-[11px] text-editor-muted hover:text-red-400 transition-colors font-medium px-2 py-0.5 rounded hover:bg-editor-highlight/50"
            >
              Reject all
            </button>
            <button
              onClick={handleAcceptAll}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-2.5 py-1 rounded transition-colors shadow-sm"
            >
              <CheckCheck size={11} />
              Accept all
            </button>
          </div>
        </div>

        {expanded && (
          <div className="flex flex-col pb-1">
            {entries.map(([path, diff]) => {
              const filename = path.split("/").pop()
              const isReviewing = reviewingFile === path
              return (
                <div
                  key={path}
                  className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors ${
                    isReviewing
                      ? "bg-blue-500/10 border-l-2 border-blue-500"
                      : "hover:bg-editor-highlight/30 border-l-2 border-transparent"
                  }`}
                  onClick={() => handleReviewFile(path, diff)}
                >
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isReviewing ? "bg-blue-400" : "bg-amber-400"}`} />
                    <span className={`text-[12px] truncate font-medium ${isReviewing ? "text-blue-300" : "text-editor-text"}`}>
                      {filename}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {/* Eye icon always visible for current reviewing file */}
                    {isReviewing && <Eye size={11} className="text-blue-400 mr-1" />}

                    {/* Accept/Reject only on hover */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleRejectOne(e, path)}
                        className="p-1 rounded text-editor-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Reject this change"
                      >
                        <X size={12} />
                      </button>
                      <button
                        onClick={(e) => handleAcceptOne(e, path, diff)}
                        className="p-1 rounded text-editor-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="Accept this change"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
