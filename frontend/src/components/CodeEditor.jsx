import Editor from "@monaco-editor/react"
import { useEditorStore } from "../stores/editorStore"
import { useProjectStore } from "../stores/projectStore"
import { filesApi } from "../lib/api"
import { useRef, useEffect } from "react"

function getLanguage(path) {
  const ext = path?.split(".").pop()
  const map = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", html: "html", css: "css", json: "json",
    md: "markdown", sh: "shell", yml: "yaml", yaml: "yaml",
  }
  return map[ext] ?? "plaintext"
}

export default function CodeEditor() {
  const { openFiles, activeFile, updateContent, markSaved } = useEditorStore()
  const project = useProjectStore((s) => s.activeProject)

  const file = openFiles.find((f) => f.path === activeFile)

  const fileRef = useRef(file)
  const projectRef = useRef(project)

  useEffect(() => {
    fileRef.current = file
    projectRef.current = project
  }, [file, project])

  if (!file) return (
    <div className="flex-1 flex items-center justify-center text-editor-muted text-sm">
      Open a file from the explorer
    </div>
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