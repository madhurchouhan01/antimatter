import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { projectsApi } from "../lib/api"
import { useProjectStore } from "../stores/projectStore"
import { FolderOpen, Plus, Trash2 } from "lucide-react"

export default function ProjectPicker() {
  const [projects, setProjects] = useState([])
  const [newName, setNewName]   = useState("")
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const navigate = useNavigate()

  const load = () => projectsApi.list().then((r) => setProjects(r.data))
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    await projectsApi.create(newName.trim())
    setNewName("")
    load()
  }

  const open = (project) => {
    setActiveProject(project)
    navigate("/editor")
  }

  const remove = async (e, id) => {
    e.stopPropagation()
    await projectsApi.delete(id)
    load()
  }

  return (
    <div className="min-h-screen bg-editor-bg p-8">
      <h1 className="text-2xl font-semibold text-editor-text mb-6">Projects</h1>

      {/* Create new */}
      <div className="flex gap-2 mb-8">
        <input
          className="bg-editor-highlight border border-editor-border rounded px-3 py-2 text-sm text-editor-text outline-none focus:border-blue-500 w-64"
          placeholder="New project name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button
          onClick={create}
          className="flex items-center gap-1 bg-editor-accent hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus size={14} /> New
        </button>
      </div>

      {/* Project list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => open(p)}
            className="bg-editor-sidebar border border-editor-border rounded-lg p-4 cursor-pointer hover:border-blue-500 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen size={18} className="text-yellow-400" />
                <span className="text-editor-text font-medium">{p.name}</span>
              </div>
              <Trash2
                size={14}
                className="text-editor-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                onClick={(e) => remove(e, p.id)}
              />
            </div>
            {p.description && (
              <p className="text-editor-muted text-xs mt-2">{p.description}</p>
            )}
            <p className="text-editor-muted text-xs mt-2">
              {new Date(p.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}