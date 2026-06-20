import { useEffect, useState, useCallback } from "react"
import { GitBranch, GitCommit, RefreshCw, Check } from "lucide-react"
import { useGitStore } from "../stores/gitStore"
import { useProjectStore } from "../stores/projectStore"
import api from "../lib/api"

export default function GitPanel() {
  const project  = useProjectStore((s) => s.activeProject)
  const { status, diff, commits, loading, setStatus, setDiff, setCommits, setLoading } = useGitStore()
  const [message, setMessage] = useState("")
  const [activeDiffFile, setActiveDiffFile] = useState(null)

  const load = useCallback(async () => {
    if (!project) return
    setLoading(true)
    try {
      const [statusRes, logRes] = await Promise.all([
        api.get(`/api/git/${project.id}/status`),
        api.get(`/api/git/${project.id}/log`),
      ])
      setStatus(statusRes.data)
      setCommits(logRes.data.commits)
    } catch (err) {
      console.error("Failed to load git details:", err)
    } finally {
      setLoading(false)
    }
  }, [project, setStatus, setCommits, setLoading])

  const loadDiff = async (filePath) => {
    const res = await api.get(`/api/git/${project.id}/diff`, {
      params: { file_path: filePath }
    })
    setDiff(res.data.diff)
    setActiveDiffFile(filePath)
  }

  const handleCommit = async () => {
    if (!message.trim() || !status) return
    const allChanged = [...status.staged, ...status.unstaged, ...status.untracked]
    await api.post(`/api/git/${project.id}/commit`, {
      message: message.trim(),
      paths: allChanged,
    })
    setMessage("")
    load()
  }

  useEffect(() => { load() }, [project?.id, load])

  if (!project) return null

  const allFiles = [
    ...(status?.staged    ?? []).map((f) => ({ path: f, state: "staged" })),
    ...(status?.unstaged  ?? []).map((f) => ({ path: f, state: "modified" })),
    ...(status?.untracked ?? []).map((f) => ({ path: f, state: "untracked" })),
  ]

  return (
    <div className="flex flex-col h-full bg-editor-sidebar text-editor-text text-sm">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-blue-400" />
          <span className="font-semibold">{status?.branch ?? "..."}</span>
        </div>
        <RefreshCw
          size={13}
          className={`cursor-pointer text-editor-muted hover:text-editor-text ${loading ? "animate-spin" : ""}`}
          onClick={load}
        />
      </div>

      {/* Changed files */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-xs text-editor-muted uppercase tracking-wider">
          Changes ({allFiles.length})
        </div>

        {allFiles.map((f) => (
          <div
            key={f.path}
            onClick={() => loadDiff(f.path)}
            className={`flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-editor-highlight
              ${activeDiffFile === f.path ? "bg-editor-highlight" : ""}`}
          >
            <span className="truncate text-xs">{f.path}</span>
            <span className={`text-xs font-mono ml-2 ${
              f.state === "staged"    ? "text-green-400" :
              f.state === "modified"  ? "text-yellow-400" :
                                        "text-editor-muted"
            }`}>
              {f.state === "staged" ? "S" : f.state === "modified" ? "M" : "U"}
            </span>
          </div>
        ))}

        {/* Diff viewer */}
        {diff && (
          <div className="mx-2 mt-2 mb-3 rounded border border-editor-border bg-editor-bg">
            <div className="px-2 py-1 text-xs text-editor-muted border-b border-editor-border">
              {activeDiffFile}
            </div>
            <pre className="p-2 text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono">
              {diff.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("+") ? "text-green-400" :
                    line.startsWith("-") ? "text-red-400"   :
                    "text-editor-muted"
                  }
                >
                  {line}
                </div>
              ))}
            </pre>
          </div>
        )}

        {/* Commit log */}
        <div className="px-3 py-2 text-xs text-editor-muted uppercase tracking-wider mt-2">
          Recent Commits
        </div>
        {commits.map((c) => (
          <div key={c.sha} className="px-3 py-1.5 hover:bg-editor-highlight">
            <div className="flex items-center gap-2">
              <GitCommit size={12} className="text-editor-muted shrink-0" />
              <span className="text-xs truncate">{c.message}</span>
            </div>
            <div className="text-xs text-editor-muted pl-5">
              {c.sha} · {c.author}
            </div>
          </div>
        ))}
      </div>

      {/* Commit input */}
      <div className="p-3 border-t border-editor-border">
        <textarea
          className="w-full bg-editor-highlight border border-editor-border rounded px-2 py-1.5 text-xs text-editor-text outline-none resize-none focus:border-blue-500"
          placeholder="Commit message..."
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          onClick={handleCommit}
          disabled={!message.trim()}
          className="mt-2 w-full flex items-center justify-center gap-1 bg-editor-accent hover:bg-blue-700 disabled:opacity-30 text-white rounded px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <Check size={12} /> Commit all changes
        </button>
      </div>
    </div>
  )
}