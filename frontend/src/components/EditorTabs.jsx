import { X } from "lucide-react"
import { useEditorStore } from "../stores/editorStore"

export default function EditorTabs() {
  const { openFiles, activeFile, closeFile } = useEditorStore()

  if (!openFiles.length) return (
    <div className="flex-1 h-9 bg-editor-sidebar border-b border-editor-border" />
  )

  return (
    <div className="flex-1 flex h-9 bg-editor-sidebar border-b border-editor-border overflow-x-auto">
      {openFiles.map((f) => {
        const name = f.path.split("/").pop()
        const isActive = f.path === activeFile
        return (
          <div
            key={f.path}
            className={`flex items-center gap-2 px-4 text-sm border-r border-editor-border cursor-pointer whitespace-nowrap
              ${isActive
                ? "bg-editor-bg text-editor-text border-t-2 border-t-blue-500"
                : "text-editor-muted hover:bg-editor-highlight"
              }`}
            onClick={() => useEditorStore.getState().openFile(f.path, f.content)}
          >
            {f.isDirty && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
            <span>{name}</span>
            <X
              size={12}
              className="opacity-50 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); closeFile(f.path) }}
            />
          </div>
        )
      })}
    </div>
  )
}