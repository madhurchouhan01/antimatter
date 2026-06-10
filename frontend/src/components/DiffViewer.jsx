import { DiffEditor } from "@monaco-editor/react"
import { useDiffStore } from "../stores/diffStore"
import { useProjectStore } from "../stores/projectStore"
import { useEditorStore } from "../stores/editorStore"
import { useChatStore } from "../stores/chatStore"
import { filesApi } from "../lib/api"
import { useState, useRef } from "react"
import { Check, X, FileCode, ChevronRight } from "lucide-react"

export default function DiffViewer() {
  const { pendingDiff, clearPendingDiff } = useDiffStore()
  const project = useProjectStore((s) => s.activeProject)
  const { openFiles, updateContent, markSaved } = useEditorStore()
  const { addMessage } = useChatStore()
  const [applying, setApplying] = useState(false)
  const editorRef = useRef(null)

  if (!pendingDiff) return null

  const fileName = pendingDiff.path.split("/").pop()
  const isNewFile = pendingDiff.original === ""

  const handleAccept = async () => {
    if (!project) return
    setApplying(true)
    try {
      await filesApi.applyPatch(project.id, pendingDiff.path, pendingDiff.modified)

      // Always sync the editor (open or not)
      updateContent(pendingDiff.path, pendingDiff.modified)
      markSaved(pendingDiff.path)

      addMessage({
        id:      crypto.randomUUID(),
        role:    "system",
        content: `✅ Changes to **${pendingDiff.path}** accepted and applied.`,
      })
      clearPendingDiff()
    } catch (err) {
      console.error("Failed to apply patch:", err)
      addMessage({
        id:      crypto.randomUUID(),
        role:    "error",
        content: `Failed to apply patch: ${err.message}`,
      })
    } finally {
      setApplying(false)
    }
  }

  const handleReject = () => {
    addMessage({
      id:      crypto.randomUUID(),
      role:    "system",
      content: `❌ Changes to **${pendingDiff.path}** rejected.`,
    })
    clearPendingDiff()
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-editor-bg/95 backdrop-blur-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-editor-sidebar border-b border-editor-border/60 shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <FileCode size={15} className="text-editor-accent" />
          <span className="text-editor-muted">AI proposed changes to</span>
          <span className="text-white font-mono font-medium">{fileName}</span>
          {/* breadcrumb */}
          <span className="text-editor-muted/50 text-xs hidden sm:flex items-center gap-1">
            <ChevronRight size={12} />
            {pendingDiff.path}
          </span>
          {isNewFile && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400 border border-green-500/25 font-medium">
              NEW FILE
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Reject */}
          <button
            onClick={handleReject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                       text-red-400 border border-red-500/30 bg-red-500/10
                       hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/50
                       transition-all duration-150"
          >
            <X size={14} />
            Reject
          </button>

          {/* Accept */}
          <button
            onClick={handleAccept}
            disabled={applying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                       text-white bg-editor-accent border border-editor-accent/50
                       hover:bg-editor-accentHover
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-150 shadow-lg shadow-blue-500/20"
          >
            <Check size={14} />
            {applying ? "Applying…" : "Accept"}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-editor-bg border-b border-editor-border/40 text-xs text-editor-muted shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/50" />
          Removed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-500/30 border border-green-500/50" />
          Added
        </span>
        <span className="ml-auto opacity-60">Review changes below · Press <kbd className="px-1 py-0.5 rounded bg-editor-highlight font-mono">Esc</kbd> to reject</span>
      </div>

      {/* Monaco Diff Editor */}
      <div className="flex-1 overflow-hidden">
        <DiffEditor
          height="100%"
          original={pendingDiff.original}
          modified={pendingDiff.modified}
          language={getLanguage(pendingDiff.path)}
          theme="tokyo-night"
          options={{
            readOnly:              true,
            renderSideBySide:      true,
            fontSize:              13,
            fontFamily:            "'JetBrains Mono', monospace",
            minimap:               { enabled: false },
            scrollBeyondLastLine:  false,
            lineNumbers:           "on",
            wordWrap:              "on",
            automaticLayout:       true,
            padding:               { top: 12 },
            renderLineHighlight:   "none",
            diffWordWrap:          "on",
          }}
          onMount={(editor, monaco) => {
            editorRef.current = editor
            // Define tokyo-night theme if not already defined
            monaco.editor.defineTheme("tokyo-night", {
              base:    "vs-dark",
              inherit: true,
              rules:   [{ background: "1a1b26" }],
              colors: {
                "editor.background":                  "#1a1b26",
                "editor.lineHighlightBackground":     "#292e4250",
                "editorLineNumber.foreground":        "#565f89",
                "editorLineNumber.activeForeground":  "#a9b1d6",
                "diffEditor.insertedTextBackground":  "#26a64130",
                "diffEditor.removedTextBackground":   "#f7768e30",
                "diffEditor.insertedLineBackground":  "#26a64115",
                "diffEditor.removedLineBackground":   "#f7768e15",
              },
            })
            monaco.editor.setTheme("tokyo-night")

            // Esc = reject
            editor.addCommand(monaco.KeyCode.Escape, handleReject)
          }}
        />
      </div>
    </div>
  )
}

function getLanguage(path) {
  const ext = path?.split(".").pop()
  const map = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", html: "html", css: "css", json: "json",
    md: "markdown", sh: "shell", yml: "yaml", yaml: "yaml",
  }
  return map[ext] ?? "plaintext"
}
