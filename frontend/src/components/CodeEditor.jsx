import Editor from "@monaco-editor/react"
import { useEditorStore } from "../stores/editorStore"
import { useProjectStore } from "../stores/projectStore"
import { filesApi } from "../lib/api"
import { useRef, useEffect, useState } from "react"
import { FolderOpen, GitBranch } from "lucide-react"
import { useFileTreeStore } from "../stores/fileTreeStore"
import { useTerminalStore } from "../stores/terminalStore"

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
    <div className="flex-1 flex flex-col items-center justify-center text-editor-muted gap-6">
      <div className="text-center">
        <p className="text-sm mb-8">Open a file from the explorer or start below</p>
        <div className="flex gap-4">
          <button
            onClick={onOpenFolder}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition disabled:opacity-50"
            title="Upload folder to project"
          >
            <FolderOpen size={18} />
            {uploading ? "Uploading..." : "Upload Folder"}
          </button>
          <button
            onClick={onCloneRepo}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition"
            title="Clone a Git repository"
          >
            <GitBranch size={18} />
            Clone Repo
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
    <div className="flex-1 flex items-center justify-center text-editor-muted text-sm">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-editor-bg border border-editor-border rounded-lg p-6 w-96 shadow-lg">
            <h2 className="text-lg font-semibold text-editor-text mb-4">Clone Repository</h2>
            <input
              type="text"
              placeholder="Enter repository URL (e.g., https://github.com/user/repo.git)"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full px-3 py-2 bg-editor-highlight border border-editor-border rounded text-editor-text text-sm mb-4 focus:outline-none focus:border-blue-500"
              onKeyPress={(e) => e.key === "Enter" && handleCloneRepo()}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCloneModal(false)
                  setRepoUrl("")
                }}
                className="px-4 py-2 bg-editor-highlight hover:bg-editor-border text-editor-text rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCloneRepo}
                disabled={!repoUrl.trim()}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition disabled:opacity-50"
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
    <div className="flex-1 flex flex-col overflow-hidden">
      <Editor
        height="100%"
        language={getLanguage(file.path)}
        value={file.content}
        theme="vs-dark"
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: "on",
          wordWrap: "on",
          automaticLayout: true,
        }}
        onChange={(val) => updateContent(file.path, val ?? "")}
        onMount={(editor, monaco) => {
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