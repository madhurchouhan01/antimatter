import { useEffect, useState } from "react"
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react"
import { filesApi } from "../lib/api"
import { useEditorStore } from "../stores/editorStore"
import { useProjectStore } from "../stores/projectStore"

function TreeNode({ node, projectId, depth = 0 }) {
  const [open, setOpen]       = useState(false)
  const [children, setChildren] = useState([])
  const openFile = useEditorStore((s) => s.openFile)

  const handleClick = async () => {
    if (node.is_dir) {
      if (!open) {
        const res = await filesApi.list(projectId, node.path)
        setChildren(res.data)
      }
      setOpen((o) => !o)
    } else {
      const res = await filesApi.read(projectId, node.path)
      openFile(node.path, res.data.content)
    }
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-editor-highlight rounded text-sm text-editor-text select-none"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {node.is_dir
          ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
          : <span className="w-3.5" />}
        {node.is_dir
          ? <Folder size={14} className="text-yellow-400 shrink-0" />
          : <File   size={14} className="text-editor-muted shrink-0" />}
        <span className="truncate">{node.name}</span>
      </div>
      {open && children.map((child) => (
        <TreeNode key={child.path} node={child} projectId={projectId} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function FileTree() {
  const project = useProjectStore((s) => s.activeProject)
  const [roots, setRoots]   = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!project) return
    setLoading(true)
    filesApi.list(project.id)
      .then((r) => setRoots(r.data))
      .finally(() => setLoading(false))
  }, [project])

  if (!project) return (
    <div className="p-4 text-editor-muted text-xs">No project open</div>
  )

  if (loading) return (
    <div className="p-4 text-editor-muted text-xs">Loading...</div>
  )

  return (
    <div className="h-full overflow-y-auto py-2">
      <div className="px-3 py-1 text-xs text-editor-muted uppercase tracking-wider font-semibold mb-1">
        {project.name}
      </div>
      {roots.map((node) => (
        <TreeNode key={node.path} node={node} projectId={project.id} />
      ))}
    </div>
  )
}