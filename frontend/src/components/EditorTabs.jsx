import { X } from "lucide-react"
import { useEditorStore } from "../stores/editorStore"

export default function EditorTabs() {
  const { openFiles, activeFile, closeFile } = useEditorStore()

  if (!openFiles.length) return (
    <div className="flex-1 h-10 bg-editor-sidebar border-b border-editor-border/50" />
  )

  return (
    <div className="flex-1 flex h-10 bg-editor-sidebar border-b border-editor-border/50 overflow-x-auto scrollbar-none">
      {openFiles.map((f) => {
        const name = f.path.split("/").pop()
        const isActive = f.path === activeFile
        return (
          <div
            key={f.path}
            className={`group flex items-center gap-2 px-4 text-[13px] border-r border-editor-border/30 cursor-pointer whitespace-nowrap transition-colors
              ${isActive
                ? "bg-editor-bg text-editor-accentHover border-t-[3px] border-t-editor-accent"
                : "bg-editor-sidebar text-editor-muted hover:bg-editor-highlight hover:text-editor-text border-t-[3px] border-t-transparent"
              }`}
            onClick={() => useEditorStore.getState().openFile(f.path, f.content)}
          >
            {f.isDirty && <span className="w-2 h-2 rounded-full bg-yellow-400/90 shadow-[0_0_8px_rgba(250,204,21,0.6)]" />}
            <span className="font-medium tracking-wide">{name}</span>
            <X
              size={14}
              className={`opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? "opacity-70 hover:text-red-400" : "hover:text-red-400"}`}
              onClick={(e) => { e.stopPropagation(); closeFile(f.path) }}
            />
          </div>
        )
      })}
    </div>
  )
}