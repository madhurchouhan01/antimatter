import Editor from "@monaco-editor/react"
import { useEditorStore } from "../stores/editorStore"
import { useProjectStore } from "../stores/projectStore"
import { filesApi } from "../lib/api"
import { useRef, useEffect, useState } from "react"
import { FolderOpen, GitBranch } from "lucide-react"
import { useFileTreeStore } from "../stores/fileTreeStore"
import { useTerminalStore } from "../stores/terminalStore"
import DiffViewer from "./DiffViewer"
import { useLSP } from "../hooks/useLSP"

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
  const monacoRef     = useRef(null)   // holds the monaco instance
  const versionRef    = useRef(1)      // LSP document version counter

  // LSP integration
  const { onFileOpen, onFileChange } = useLSP(project?.id, monacoRef)

  const file = openFiles.find((f) => f.path === activeFile)

  const fileRef    = useRef(file)
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-editor-bg relative">
      {/* AI Diff overlay — mounts on top of editor when agent proposes a change */}
      <DiffViewer />

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
        }}
        onChange={(val) => {
          const v = versionRef.current++
          updateContent(file.path, val ?? "")
          onFileChange(file.path, val ?? "", v)
        }}
        onMount={(editor, monaco) => {
          monacoRef.current = monaco

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

          // Notify LSP about this file
          onFileOpen(file.path, file.content ?? "", monaco)

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
        }}
      />
    </div>
  )
}