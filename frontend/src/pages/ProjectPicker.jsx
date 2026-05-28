import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { projectsApi } from "../lib/api"
import { useProjectStore } from "../stores/projectStore"
import { FolderOpen, Plus, Trash2, Code2, ArrowRight } from "lucide-react"

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
    if (window.confirm("Are you sure you want to delete this project?")) {
      await projectsApi.delete(id)
      load()
    }
  }

  return (
    <div className="min-h-screen bg-editor-bg relative overflow-hidden flex flex-col p-8 sm:p-12 lg:p-20">
      {/* Background decorations */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="z-10 max-w-6xl w-full mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight mb-2 flex items-center gap-3">
              <Code2 className="text-blue-500" size={32} />
              Your Workspaces
            </h1>
            <p className="text-editor-muted text-sm">Create a new project or select an existing one to continue.</p>
          </div>

          {/* Create new */}
          <div className="flex items-center gap-3 bg-editor-sidebar/50 backdrop-blur-md border border-editor-border/50 p-1.5 rounded-xl shadow-lg">
            <input
              className="bg-transparent border-none rounded-lg px-4 py-2.5 text-sm text-editor-text outline-none placeholder:text-editor-muted/70 w-64 focus:ring-0"
              placeholder="New project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button
              onClick={create}
              disabled={!newName.trim()}
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-5 py-2.5 text-sm font-semibold transition-all shadow-md active:scale-[0.98]"
            >
              <Plus size={16} /> Create
            </button>
          </div>
        </div>

        {/* Project list */}
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 border border-dashed border-editor-border/50 rounded-2xl bg-editor-sidebar/30 backdrop-blur-sm">
            <FolderOpen className="text-editor-muted/50 mb-4" size={48} />
            <h3 className="text-editor-text font-medium text-lg mb-1">No projects found</h3>
            <p className="text-editor-muted text-sm">Create your first workspace to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => open(p)}
                className="group relative bg-editor-sidebar/60 backdrop-blur-xl border border-editor-border/50 rounded-2xl p-6 cursor-pointer hover:border-blue-500/50 hover:bg-editor-sidebar/80 transition-all duration-300 shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-[40px] group-hover:bg-blue-500/10 transition-colors" />
                
                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                    <FolderOpen size={20} />
                  </div>
                  <button
                    onClick={(e) => remove(e, p.id)}
                    className="text-editor-muted/50 hover:text-red-400 p-2 rounded-lg hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                    title="Delete project"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="relative z-10">
                  <h3 className="text-white font-medium text-lg mb-1 truncate">{p.name}</h3>
                  {p.description ? (
                    <p className="text-editor-muted text-xs line-clamp-2 mb-4 h-8">{p.description}</p>
                  ) : (
                    <p className="text-editor-muted/50 text-xs italic mb-4 h-8">No description</p>
                  )}
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-editor-border/50">
                    <span className="text-editor-muted text-[11px] font-medium tracking-wider uppercase">
                      {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <ArrowRight size={14} className="text-blue-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}