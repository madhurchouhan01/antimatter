import { useFileTreeStore } from "../stores/fileTreeStore"
import { useProjectStore }  from "../stores/projectStore"
import { Database }         from "lucide-react"

export default function StatusBar() {
    const indexing = useFileTreeStore((s) => s.indexing)
    const project  = useProjectStore((s) => s.activeProject)

    return (
        <div className="flex items-center gap-3 px-4 py-0.5 bg-editor-accent text-white text-xs">
            <span>{project?.name ?? ""}</span>
            <div className="ml-auto flex items-center gap-2">
                {indexing && (
                    <div className="flex items-center gap-1 animate-pulse">
                        <Database size={11} />
                        <span>Indexing codebase...</span>
                    </div>
                )}
                {!indexing && (
                    <div className="flex items-center gap-1 text-green-300">
                        <Database size={11} />
                        <span>Index ready</span>
                    </div>
                )}
            </div>
        </div>
    )
}
