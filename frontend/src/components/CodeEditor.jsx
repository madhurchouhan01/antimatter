import Editor, { DiffEditor } from "@monaco-editor/react"
import { useEditorStore } from "../stores/editorStore"
import { useProjectStore } from "../stores/projectStore"
import { filesApi } from "../lib/api"
import { useRef, useEffect, useState } from "react"
import { FolderOpen, GitBranch, Sparkles } from "lucide-react"
import { useFileTreeStore } from "../stores/fileTreeStore"
import { useTerminalStore } from "../stores/terminalStore"
import { useChatStore } from "../stores/chatStore"
import { useDiffStore } from "../stores/diffStore"
import { useGhostStore } from "../stores/ghostStore"
import InlineChatWidget from "./InlineChatWidget"

/** Extract the first fenced code block from markdown text */
function extractCodeBlock(text) {
  const m = text?.match(/```(?:\w+)?\n([\s\S]*?)```/)
  return m ? m[1].trimEnd() : null
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

function EmptyState({ project, onOpenFolder, onCloneRepo, uploading }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-editor-muted gap-8 relative overflow-hidden bg-editor-bg">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="text-center z-10 flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-editor-highlight/50 flex items-center justify-center mb-6 shadow-xl border border-editor-border/50">
          <FolderOpen size={32} className="text-editor-accent" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Workspace Ready</h2>
        <p className="text-sm text-editor-muted mb-8 max-w-sm">
          Open a file from the explorer on the left, or bring your code into the workspace to get started.
        </p>
        
        <div className="flex gap-4">
          <button
            onClick={onOpenFolder}
            disabled={uploading}
            className="group relative flex items-center gap-2 px-6 py-2.5 bg-editor-sidebar border border-editor-border/50 hover:border-editor-accent/50 text-white rounded-xl transition-all shadow-lg hover:shadow-glow disabled:opacity-50"
            title="Upload folder to project"
          >
            <FolderOpen size={18} className="text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="font-medium text-sm">{uploading ? "Uploading..." : "Upload Folder"}</span>
          </button>
          
          <button
            onClick={onCloneRepo}
            className="group relative flex items-center gap-2 px-6 py-2.5 bg-editor-sidebar border border-editor-border/50 hover:border-editor-accentHover/50 text-white rounded-xl transition-all shadow-lg hover:shadow-glow disabled:opacity-50"
            title="Clone a Git repository"
          >
            <GitBranch size={18} className="text-purple-400 group-hover:scale-110 transition-transform" />
            <span className="font-medium text-sm">Clone Repo</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CodeEditor() {
  const { openFiles, activeFile, updateContent, markSaved } = useEditorStore()
  const project = useProjectStore((s) => s.activeProject)
  const [showCloneModal, setShowCloneModal] = useState(false)
  const [repoUrl, setRepoUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const folderInputRef = useRef(null)
  const editorRef  = useRef(null)
  const monacoRef  = useRef(null)
  const [inlineChat, setInlineChat] = useState(null)
  const [selection, setSelection] = useState(null)
  const [selectionButtonPos, setSelectionButtonPos] = useState({ top: 0, left: 0, visible: false })
  const selectionDebounceRef = useRef(null)  // debounce timer for selection stabilization
  const lastMsgIdRef = useRef(null)   // last processed assistant msg id
  const acceptingRef = useRef(false)  // flag: currently accepting ghost
  const providerRef  = useRef(null)   // inline completions provider disposable

  // Ghost store
  const ghost = useGhostStore((s) => s.ghost)
  
  const pendingDiffs = useDiffStore((s) => s.pendingDiffs)
  const reviewingFile = useDiffStore((s) => s.reviewingFile)
  const removePendingDiff = useDiffStore((s) => s.removePendingDiff)

  // ── Subscribe to chatStore outside React to avoid batching issues ──────────
  useEffect(() => {
    let prevIsStreaming = useChatStore.getState().isStreaming

    const unsub = useChatStore.subscribe((state) => {
      // Fire when streaming just turned OFF
      if (prevIsStreaming && !state.isStreaming) {
        prevIsStreaming = false
        const editor = editorRef.current
        if (!editor) return
        const last = [...state.messages].reverse().find((m) => m.role === "assistant")
        if (!last || last.id === lastMsgIdRef.current) return
        lastMsgIdRef.current = last.id
        const code = extractCodeBlock(last.content)
        if (!code) return
        const pos = editor.getPosition()
        if (!pos) return
        useGhostStore.getState().setGhost({ text: code, line: pos.lineNumber, col: pos.column })
      } else {
        prevIsStreaming = state.isStreaming
      }
    })
    return unsub
  }, [])

  // ── When ghost is set, trigger Monaco inline suggestion display ───────────────
  useEffect(() => {
    if (!ghost || !editorRef.current) return
    // Small delay so the provider is queried after state settles
    const t = setTimeout(() => {
      editorRef.current?.trigger("ghost", "editor.action.inlineSuggest.trigger", {})
    }, 60)
    return () => clearTimeout(t)
  }, [ghost])

  // Cleanup provider and debounce on unmount
  useEffect(() => () => {
    providerRef.current?.dispose()
    if (selectionDebounceRef.current) {
      clearTimeout(selectionDebounceRef.current)
    }
    useGhostStore.getState().clearGhost()
  }, [])

  const file = openFiles.find((f) => f.path === activeFile)

  const fileRef = useRef(file)
  const projectRef = useRef(project)

  useEffect(() => {
    fileRef.current = file
    projectRef.current = project
  }, [file, project])

  const handleCloneRepo = () => {
    if (!repoUrl.trim() || !project) return
    
    const termStore = useTerminalStore.getState()
    const cloneCmd = `git clone ${repoUrl}\r`

    if (!termStore.termOpen) {
      // 1. Open the terminal pane globally
      termStore.setTermOpen(true)
      // 2. Queue the command to run as soon as connection is ready
      termStore.addPendingCommand(cloneCmd)
    } else if (termStore.sendCommand) {
      // Execute command immediately
      termStore.sendCommand(cloneCmd)
    } else {
      // Terminal is open but still establishing connection
      termStore.addPendingCommand(cloneCmd)
    }

    setRepoUrl("")
    setShowCloneModal(false)
  }

  const handleFolderUploadClick = () => {
    if (folderInputRef.current) folderInputRef.current.click()
  }

  const handleFolderChange = async (e) => {
    const files = e.target.files
    if (!files || !project) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const relativePath = file.webkitRelativePath || file.name
        await filesApi.upload(project.id, relativePath, file)
      }
      useFileTreeStore.getState().markDirty("/", "upload")
      alert("Folder uploaded successfully!")
    } catch (err) {
      console.error("Folder upload failed", err)
      alert("Folder upload failed: " + err.message)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  if (!project) return (
    <div className="flex-1 flex items-center justify-center text-editor-muted text-sm bg-editor-bg">
      No project open
    </div>
  )

  if (!file) return (
    <>
      <EmptyState 
        project={project}
        onOpenFolder={handleFolderUploadClick}
        onCloneRepo={() => setShowCloneModal(true)}
        uploading={uploading}
      />
      <input
        type="file"
        className="hidden"
        ref={folderInputRef}
        onChange={handleFolderChange}
        directory=""
        webkitdirectory=""
        mozdirectory=""
      />

      {/* Clone Repo Modal */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-editor-sidebar border border-editor-border/50 rounded-2xl p-8 w-[400px] shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Clone Repository</h2>
            <p className="text-editor-muted text-sm mb-6">Enter a Git URL to clone into your workspace.</p>
            <input
              type="text"
              placeholder="https://github.com/user/repo.git"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full px-4 py-3 bg-editor-bg border border-editor-border/50 rounded-xl text-white text-sm mb-6 focus:outline-none focus:border-editor-accent/50 transition-colors shadow-inner"
              onKeyPress={(e) => e.key === "Enter" && handleCloneRepo()}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCloneModal(false)
                  setRepoUrl("")
                }}
                className="px-5 py-2.5 bg-transparent hover:bg-editor-highlight text-editor-muted hover:text-white rounded-xl transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCloneRepo}
                disabled={!repoUrl.trim()}
                className="px-5 py-2.5 bg-editor-accent hover:bg-editor-accentHover text-white rounded-xl transition-colors disabled:opacity-50 text-sm font-medium shadow-lg shadow-blue-500/20"
              >
                Clone
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  // Only show the diff editor when the user explicitly clicks a file to review
  const pendingDiff = (file && reviewingFile === file.path) ? pendingDiffs[file.path] : null

  const handleAcceptDiff = async () => {
    if (!pendingDiff || !project || !file) return
    try {
      await filesApi.write(project.id, file.path, pendingDiff.modified)
      updateContent(file.path, pendingDiff.modified)
      markSaved(file.path)
      removePendingDiff(file.path)
      useDiffStore.getState().setReviewingFile(null)
    } catch (e) {
      console.error("Failed to accept diff", e)
    }
  }

  const handleRejectDiff = () => {
    if (!file) return
    removePendingDiff(file.path)
    useDiffStore.getState().setReviewingFile(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-editor-bg relative group">
      
      {pendingDiff && (
        <div className="absolute top-4 right-6 z-20 flex items-center gap-2 bg-editor-sidebar border border-editor-border/50 rounded-lg p-1.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button 
            onClick={handleAcceptDiff}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors"
          >
            Accept
          </button>
          <button 
            onClick={handleRejectDiff}
            className="px-3 py-1.5 hover:bg-editor-highlight text-editor-text text-sm font-medium rounded-md transition-colors"
          >
            Reject
          </button>
        </div>
      )}

      {pendingDiff ? (
        <DiffEditor
          height="100%"
          language={getLanguage(file.path)}
          original={pendingDiff.original}
          modified={pendingDiff.modified}
          theme="tokyo-night"
          options={{
            renderSideBySide: false,
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            wordWrap: "on",
            automaticLayout: true,
            padding: { top: 16 },
            readOnly: false,
          }}
          onMount={(editor, monaco) => {
            monaco.editor.defineTheme('tokyo-night', {
              base: 'vs-dark',
              inherit: true,
              rules: [{ background: '1a1b26' }],
              colors: {
                'editor.background': '#1a1b26',
                'editor.lineHighlightBackground': '#292e4250',
                'editorLineNumber.foreground': '#565f89',
                'editorLineNumber.activeForeground': '#a9b1d6',
                'editorIndentGuide.background': '#27273a',
                'editorIndentGuide.activeBackground': '#3b4261',
              }
            })
            monaco.editor.setTheme('tokyo-night')

            // Track widgets so we can clean them up
            let widgets = []
            let hoverListener = null
            
            let suppressHover = false
            let lastMouseX = -1
            let lastMouseY = -1
            
            editor.onDidUpdateDiff(() => {
              const changes = editor.getLineChanges()
              const modifiedEditor = editor.getModifiedEditor()
              const originalEditor = editor.getOriginalEditor()
              
              widgets.forEach(w => modifiedEditor.removeContentWidget(w.widget))
              widgets = []
              if (hoverListener) hoverListener.dispose()
              
              if (!changes || changes.length === 0) return
              
              changes.forEach((c, i) => {
                const layout = modifiedEditor.getLayoutInfo()
                const domNode = document.createElement("div")
                domNode.className = "opacity-0 transition-opacity duration-300 z-[100] cursor-default pointer-events-none"
                
                const wrapper = document.createElement("div")
                wrapper.className = "flex"
                wrapper.style.transform = `translateX(${layout.width - layout.contentLeft - 30}px) translateX(-100%)`
                
                const btnContainer = document.createElement("div")
                btnContainer.className = "flex items-center bg-[#1e1e2e] border border-white/10 rounded-md shadow-xl overflow-hidden pointer-events-none transition-all duration-200"
                
                let isMouseOverWidget = false
                btnContainer.addEventListener("mouseenter", () => {
                  if (suppressHover) return
                  isMouseOverWidget = true
                  domNode.style.opacity = "1"
                })
                btnContainer.addEventListener("mouseleave", () => {
                  isMouseOverWidget = false
                  domNode.style.opacity = "0"
                })
                
                const btnAccept = document.createElement("button")
                btnAccept.className = "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors border-r border-white/10"
                btnAccept.innerText = "Accept"
                
                const btnReject = document.createElement("button")
                btnReject.className = "px-3 py-1.5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium transition-colors"
                btnReject.innerText = "Reject"
                
                btnContainer.appendChild(btnAccept)
                btnContainer.appendChild(btnReject)
                wrapper.appendChild(btnContainer)
                domNode.appendChild(wrapper)
                
                const getOriginalRange = () => {
                  let start = c.originalStartLineNumber
                  let end = c.originalEndLineNumber
                  if (end === 0) { start = Math.max(1, start); end = start }
                  const model = originalEditor.getModel()
                  return new monaco.Range(start, 1, end, model.getLineMaxColumn(end) || 1)
                }
                
                const getModifiedRange = () => {
                  let start = c.modifiedStartLineNumber
                  let end = c.modifiedEndLineNumber
                  if (end === 0) { start = Math.max(1, start); end = start }
                  const model = modifiedEditor.getModel()
                  return new monaco.Range(start, 1, end, model.getLineMaxColumn(end) || 1)
                }

                btnAccept.onclick = () => {
                  suppressHover = true
                  btnContainer.style.pointerEvents = "none"
                  const modRange = getModifiedRange()
                  const modText = c.modifiedEndLineNumber === 0 ? "" : modifiedEditor.getModel().getValueInRange(modRange)
                  // Apply to original to make diff disappear
                  originalEditor.getModel().pushEditOperations([], [{ range: getOriginalRange(), text: modText }], () => null)
                  
                  useDiffStore.getState().addPendingDiff(
                    file.path, 
                    originalEditor.getModel().getValue(), 
                    modifiedEditor.getModel().getValue()
                  )
                }
                
                btnReject.onclick = () => {
                  suppressHover = true
                  btnContainer.style.pointerEvents = "none"
                  const origRange = getOriginalRange()
                  const origText = c.originalEndLineNumber === 0 ? "" : originalEditor.getModel().getValueInRange(origRange)
                  // Revert modified to original
                  modifiedEditor.getModel().pushEditOperations([], [{ range: getModifiedRange(), text: origText }], () => null)
                  
                  useDiffStore.getState().addPendingDiff(
                    file.path, 
                    originalEditor.getModel().getValue(), 
                    modifiedEditor.getModel().getValue()
                  )
                }
                
                const line = Math.max(1, c.modifiedStartLineNumber)
                const widgetObj = {
                  getId: () => `diff-widget-${i}`,
                  getDomNode: () => domNode,
                  getPosition: () => ({
                    position: { lineNumber: line, column: 1 },
                    preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.EXACT]
                  })
                }
                
                modifiedEditor.addContentWidget(widgetObj)
                widgets.push({
                  widget: widgetObj,
                  domNode,
                  btnContainer,
                  get isMouseOverWidget() { return isMouseOverWidget },
                  startLine: Math.max(1, c.modifiedStartLineNumber),
                  endLine: Math.max(1, c.modifiedEndLineNumber)
                })
              })
              
              hoverListener = modifiedEditor.onMouseMove((e) => {
                if (!e.event.browserEvent) return
                const currentX = e.event.browserEvent.clientX
                const currentY = e.event.browserEvent.clientY
                
                if (suppressHover) {
                  const dist = Math.abs(currentX - lastMouseX) + Math.abs(currentY - lastMouseY)
                  if (dist > 15) {
                    suppressHover = false
                  } else {
                    return
                  }
                }
                
                lastMouseX = currentX
                lastMouseY = currentY

                if (!e.target.position) return
                const line = e.target.position.lineNumber
                widgets.forEach(w => {
                  if (w.isMouseOverWidget) return
                  const isHovered = line >= w.startLine - 1 && line <= w.endLine + 1
                  w.domNode.style.opacity = isHovered ? "1" : "0"
                  w.btnContainer.style.pointerEvents = isHovered ? "auto" : "none"
                })
              })
            })
          }}
        />
      ) : (

      <Editor
        height="100%"
        language={getLanguage(file.path)}
        value={file.content}
        theme="tokyo-night"
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: "on",
          wordWrap: "on",
          automaticLayout: true,
          padding: { top: 16 },
          renderLineHighlight: "all",
          cursorBlinking: "smooth",
          smoothScrolling: true,
          inlineSuggest: { enabled: true },
        }}
        onChange={(val) => updateContent(file.path, val ?? "")}
        onMount={(editor, monaco) => {
          // Store refs for InlineChatWidget positioning
          editorRef.current  = editor
          monacoRef.current  = monaco

          monaco.editor.defineTheme('tokyo-night', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { background: '1a1b26' }
            ],
            colors: {
              'editor.background': '#1a1b26',
              'editor.lineHighlightBackground': '#292e4250',
              'editorLineNumber.foreground': '#565f89',
              'editorLineNumber.activeForeground': '#a9b1d6',
              'editorIndentGuide.background': '#27273a',
              'editorIndentGuide.activeBackground': '#3b4261',
            }
          });
          monaco.editor.setTheme('tokyo-night');

          // Ctrl+S / Cmd+S to save
          editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
            async () => {
              const currentFile = fileRef.current
              const currentProject = projectRef.current
              if (!currentFile || !currentProject) return
              const val = editor.getValue()
              await filesApi.write(currentProject.id, currentFile.path, val)
              useEditorStore.getState().markSaved(currentFile.path)
            }
          )

          // Register inline completions provider (Copilot-style ghost text)
          // Monaco handles Tab-to-accept and rendering natively via this API.
          providerRef.current?.dispose()
          providerRef.current = monaco.languages.registerInlineCompletionsProvider('*', {
            provideInlineCompletions: (_model, position) => {
              const { ghost: g } = useGhostStore.getState()
              if (!g || position.lineNumber !== g.line) return { items: [] }
              return {
                items: [{
                  insertText: g.text,
                  range: new monaco.Range(g.line, g.col, g.line, g.col),
                }],
                enableForwardStability: true,
              }
            },
            disposeInlineCompletions: () => {},
            handleItemDidShow: () => {},
          })

          // Ctrl+K / Cmd+K — open inline AI chat at cursor line
          editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
            () => {
              const sel          = editor.getSelection()
              const pos          = editor.getPosition()
              if (!pos) return
              const selectedText = (sel && !sel.isEmpty())
                ? editor.getModel()?.getValueInRange(sel) ?? ""
                : ""
              setInlineChat({ line: pos.lineNumber, selectedText })
            }
          )

          // Track selection changes to show "Send to Agent" button
          editor.onDidChangeCursorSelection((e) => {
            // Clear any pending debounce timer
            if (selectionDebounceRef.current) {
              clearTimeout(selectionDebounceRef.current)
            }

            const sel = editor.getSelection()
            if (sel && !sel.isEmpty()) {
              const selectedText = editor.getModel()?.getValueInRange(sel) ?? ""
              
              // Debounce: only show button after user stops selecting for 200ms
              selectionDebounceRef.current = setTimeout(() => {
                setSelection({
                  text: selectedText,
                  line: sel.startLineNumber,
                  column: sel.startColumn,
                  isEmpty: false,
                })
                
                // Compute button position at the end of selection
                const editorLayout = editor.getLayoutInfo()
                const pos = editor.getScrolledVisiblePosition({ lineNumber: sel.endLineNumber, column: sel.endColumn })
                if (pos) {
                  setSelectionButtonPos({
                    top: pos.top + 24,
                    left: Math.min(pos.left, editorLayout.width - 180),
                    visible: true,
                  })
                }
              }, 200)
            } else {
              setSelection(null)
              setSelectionButtonPos((prev) => ({ ...prev, visible: false }))
            }
          })
        }}
      />

      )}
      
      {/* Inline AI chat widget — floats below cursor line on Ctrl+K */}
      {inlineChat && !pendingDiff && (
        <InlineChatWidget
          editor={editorRef.current}
          line={inlineChat.line}
          selectedText={inlineChat.selectedText}
          filePath={file.path}
          onClose={() => setInlineChat(null)}
        />
      )}

      {/* "Send to Agent" button — appears when text is selected */}
      {selection && selection.text.trim() && selectionButtonPos.visible && !inlineChat && (
        <div
          className="absolute z-30 pointer-events-auto animate-in fade-in duration-200"
          style={{
            top: `${selectionButtonPos.top}px`,
            left: `${selectionButtonPos.left}px`,
          }}
        >
          <button
            onClick={() => {
              setInlineChat({ line: selection.line, selectedText: selection.text })
              setSelection(null)
              setSelectionButtonPos((prev) => ({ ...prev, visible: false }))
              if (editorRef.current) {
                const sel = editorRef.current.getSelection()
                if (sel) {
                  const endLine = sel.endLineNumber
                  const endCol = sel.endColumn
                  editorRef.current.setSelection({
                    startLineNumber: endLine,
                    startColumn: endCol,
                    endLineNumber: endLine,
                    endColumn: endCol
                  })
                }
              }
            }}
            className="group flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-2xl hover:shadow-blue-500/40 transition-all duration-150 transform hover:scale-105 active:scale-95 border border-blue-400/30"
            title="Send selected code to agent (Ctrl+K)"
          >
            <Sparkles size={16} className="group-hover:rotate-12 transition-transform duration-300" />
            <span>Ask AI</span>
          </button>
        </div>
      )}
    </div>
  )
}