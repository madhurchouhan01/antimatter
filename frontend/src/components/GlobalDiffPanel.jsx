import { ChevronDown, Check, X, Eye, CheckCheck, Sparkles, Plus, Minus } from "lucide-react"
import { useDiffStore } from "../stores/diffStore"
import { useProjectStore } from "../stores/projectStore"
import { useEditorStore } from "../stores/editorStore"
import { filesApi } from "../lib/api"
import { useState } from "react"

export default function GlobalDiffPanel() {
  const pendingDiffs    = useDiffStore((s) => s.pendingDiffs)
  const agentDone       = useDiffStore((s) => s.agentDone)
  const summary         = useDiffStore((s) => s.summary)
  const reviewingFile   = useDiffStore((s) => s.reviewingFile)
  const removePendingDiff  = useDiffStore((s) => s.removePendingDiff)
  const clearAll           = useDiffStore((s) => s.clearAll)
  const setReviewingFile   = useDiffStore((s) => s.setReviewingFile)
  const { openFile, updateContent, markSaved } = useEditorStore()
  const project = useProjectStore((s) => s.activeProject)

  const [expanded, setExpanded] = useState(true)

  const entries = Object.entries(pendingDiffs)

  // Only render if there are diffs AND the agent has finished
  if (entries.length === 0 || !agentDone) return null

  const handleReviewFile = (path, diff) => {
    setReviewingFile(path)
    // Open the file with the original content so the DiffEditor can compare
    openFile(path, diff.original)
  }

  const handleAcceptAll = () => {
    const { acceptPendingDiff } = useDiffStore.getState()
    for (const [path] of entries) {
      acceptPendingDiff(path)
      markSaved(path)
    }
    // Agent run stops here — user must send a new message to continue
  }

  const handleUndoAll = async () => {
    if (!project) return
    try {
      // Revert all changes to original
      for (const [path, diff] of entries) {
        await filesApi.write(project.id, path, diff.original)
        updateContent(path, diff.original)
      }
      clearAll()
      // Agent run stops here — user must send a new message to continue
    } catch (err) {
      console.error("Failed to undo all changes:", err)
    }
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

      {/* Summary statistics panel */}
      {summary && (
        <div className="px-3 py-2 bg-editor-highlight/20 border-b border-editor-border/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Plus size={12} className="text-green-400" />
              <span className="text-[11px] text-green-300 font-medium">{summary.totalLinesAdded}</span>
              <span className="text-[10px] text-editor-muted">added</span>
            </div>
            <div className="flex items-center gap-1">
              <Minus size={12} className="text-red-400" />
              <span className="text-[11px] text-red-300 font-medium">{summary.totalLinesRemoved}</span>
              <span className="text-[10px] text-editor-muted">removed</span>
            </div>
            <div className="text-[10px] text-editor-muted ml-auto">
              Across {summary.filesChanged} file{summary.filesChanged > 1 ? "s" : ""}
            </div>
          </div>
          
          {/* Brief file breakdown */}
          {summary.fileChanges.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-editor-border/20 flex flex-wrap gap-2">
              {summary.fileChanges.map(file => (
                <div key={file.path} className="text-[10px] text-editor-muted px-1.5 py-0.5 rounded bg-editor-highlight/40">
                  <span className="font-medium">{file.filename}</span>
                  {(file.added > 0 || file.removed > 0) && (
                    <span>
                      {file.added > 0 && <span className="text-green-400"> +{file.added}</span>}
                      {file.removed > 0 && <span className="text-red-400"> -{file.removed}</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              onClick={handleUndoAll}
              className="text-[11px] text-editor-muted hover:text-red-400 transition-colors font-medium px-2 py-0.5 rounded hover:bg-editor-highlight/50"
            >
              Undo all
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
              const isAccepted = diff.accepted
              return (
                <div
                  key={path}
                  className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors ${
                    isAccepted
                      ? "bg-green-500/10 border-l-2 border-green-500"
                      : isReviewing
                      ? "bg-blue-500/10 border-l-2 border-blue-500"
                      : "hover:bg-editor-highlight/30 border-l-2 border-transparent"
                  }`}
                  onClick={() => handleReviewFile(path, diff)}
                >
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAccepted ? "bg-green-400" : isReviewing ? "bg-blue-400" : "bg-amber-400"}`} />
                    <span className={`text-[12px] truncate font-medium ${isAccepted ? "text-green-300 line-through opacity-70" : isReviewing ? "text-blue-300" : "text-editor-text"}`}>
                      {filename}
                    </span>
                    {isAccepted && (
                      <span className="text-[10px] text-green-400 font-semibold ml-1 shrink-0">✓ Accepted</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {/* Eye icon always visible for current reviewing file */}
                    {isReviewing && <Eye size={11} className="text-blue-400 mr-1" />}

                    {/* Undo/Accept buttons only on hover */}
                    {!isAccepted && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleUndoOne(e, path, diff)}
                          className="p-1 rounded text-editor-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Undo this change"
                        >
                          <X size={12} />
                        </button>
                        <button
                          onClick={(e) => handleAcceptOne(e, path)}
                          className="p-1 rounded text-editor-muted hover:text-green-400 hover:bg-green-500/10 transition-colors"
                          title="Accept and confirm this change"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    )}
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
