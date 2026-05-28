import { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react"
import { Send, X, Sparkles, Code2 } from "lucide-react"
import { useProjectStore } from "../stores/projectStore"
import { useAgentSocket } from "../hooks/useAgentSocket"

/**
 * Inline AI chat widget injected at the cursor line inside Monaco.
 * Opened by Ctrl+K. Floats just below the target line.
 *
 * Props:
 *   editor       — Monaco IStandaloneCodeEditor instance
 *   line         — line number where Ctrl+K was pressed
 *   selectedText — selected code (may be empty string)
 *   filePath     — path of the open file (for context)
 *   onClose      — called to dismiss the widget
 */
export default function InlineChatWidget({ editor, line, selectedText, filePath, onClose }) {
  const [input, setInput]       = useState("")
  const [style, setStyle]       = useState({ top: -9999, opacity: 0 })
  const [hasPos, setHasPos]     = useState(false)
  const textareaRef             = useRef(null)
  const containerRef            = useRef(null)

  const project     = useProjectStore((s) => s.activeProject)
  const { sendMessage } = useAgentSocket(project?.id)

  // ── Position widget below the target line ──────────────────────────────────
  const computePosition = useCallback(() => {
    if (!editor || !line) return
    const pos = editor.getScrolledVisiblePosition({ lineNumber: line, column: 1 })
    if (!pos) return   // line scrolled out of view — keep current pos

    const lineHeight = editor.getOption(editor._standaloneKeybindingService ? 0 : 65) || 20
    const layout     = editor.getLayoutInfo()
    const gutterW    = layout.contentLeft ?? 64

    setStyle({
      top:     pos.top + (pos.height || 20) + 4,
      left:    gutterW,
      right:   16,
      opacity: 1,
    })
    setHasPos(true)
  }, [editor, line])

  useLayoutEffect(() => {
    computePosition()
    const d1 = editor?.onDidScrollChange(computePosition)
    const d2 = editor?.onDidLayoutChange(computePosition)
    return () => { d1?.dispose(); d2?.dispose() }
  }, [computePosition, editor])

  // Auto-focus the textarea once positioned
  useEffect(() => {
    if (hasPos) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [hasPos])

  // ── Close on Escape / click-outside ───────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose()
      }
    }
    // Slight delay so the Ctrl+K click itself doesn't immediately close
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 100)
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onClick) }
  }, [onClose])

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = () => {
    const text = input.trim()
    if (!text) return

    const fileName = filePath?.split("/").pop() ?? "file"
    const hasSelection = selectedText?.trim().length > 0

    // Build context-enriched message the agent will receive
    const enriched = [
      `[Inline edit • ${fileName} • line ${line}]`,
      hasSelection
        ? `\nSelected code:\n\`\`\`\n${selectedText}\n\`\`\`\n`
        : `\nFile: \`${filePath}\`\n`,
      `Task: ${text}`,
    ].join("\n")

    sendMessage(enriched)
    setInput("")
    onClose()
  }

  const shortPath = filePath
    ? filePath.split("/").slice(-2).join("/")
    : ""

  return (
    <div
      ref={containerRef}
      style={style}
      className="absolute z-50 transition-opacity duration-150 pointer-events-auto"
    >
      <div className="
        bg-[#1e1f2e]/95 backdrop-blur-xl
        border border-editor-border/60
        rounded-xl shadow-2xl shadow-black/50
        overflow-hidden
        w-full max-w-xl
      ">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-editor-border/40 bg-editor-bg/50">
          <div className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/15 border border-blue-500/25">
            <Sparkles size={11} className="text-editor-accent" />
          </div>
          <span className="text-[11px] font-semibold text-white uppercase tracking-wider">AI Edit</span>

          {/* Context pill */}
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-editor-muted/70 bg-editor-highlight/40 border border-editor-border/30 rounded-md px-2 py-0.5">
            <Code2 size={9} />
            <span className="font-mono">{shortPath}:{line}</span>
            {selectedText && (
              <span className="text-blue-400/80 ml-1">
                ({selectedText.split("\n").length} lines selected)
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="ml-2 text-editor-muted/60 hover:text-editor-muted transition-colors rounded p-0.5"
          >
            <X size={13} />
          </button>
        </div>

        {/* Selected code preview */}
        {selectedText && (
          <div className="px-3 py-2 border-b border-editor-border/30 bg-editor-bg/30 max-h-28 overflow-y-auto">
            <pre className="text-[11px] font-mono text-editor-muted/80 whitespace-pre-wrap leading-tight">
              {selectedText.length > 300
                ? selectedText.slice(0, 300) + "\n…"
                : selectedText}
            </pre>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = "auto"
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
              if (e.key === "Escape") {
                e.preventDefault()
                onClose()
              }
            }}
            rows={1}
            placeholder="Describe what to do here… (Enter to send, Shift+Enter for newline)"
            className="
              flex-1 bg-transparent text-white text-[12.5px] resize-none outline-none
              placeholder:text-editor-muted/50 min-h-[22px] max-h-[120px] leading-relaxed
            "
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="
              flex items-center justify-center w-7 h-7 rounded-lg mb-0.5
              bg-editor-accent hover:bg-editor-accentHover
              disabled:bg-editor-highlight disabled:text-editor-muted
              text-white transition-all shadow-md disabled:shadow-none shrink-0
            "
          >
            <Send size={12} className={input.trim() ? "-translate-y-px translate-x-px" : ""} />
          </button>
        </div>
      </div>
    </div>
  )
}
