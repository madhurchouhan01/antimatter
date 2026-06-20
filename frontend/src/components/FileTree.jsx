import { useEffect, useState, useRef } from "react"
import {
  ChevronRight, ChevronDown, File, Folder, Upload, Trash2, RefreshCw, FolderOpen,
  FileCode, FileText, Settings, AlertTriangle, FileSpreadsheet, Terminal,
  FilePlus, FolderPlus, Check, X
} from "lucide-react"
import { filesApi } from "../lib/api"
import { useEditorStore } from "../stores/editorStore"
import { useProjectStore } from "../stores/projectStore"
import { useFileTreeStore } from "../stores/fileTreeStore"

// Real programming language icons (custom SVGs for premium look)
const PyIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.91 2C7.39 2 7.05 4 7.05 5.5v2.3h4.94v.74H5.06c-1.5 0-3.06 1.15-3.06 4.39v2.79c0 1.55 1.25 3.09 2.76 3.09h1.67v-2.32c0-1.89 1.6-3.41 3.52-3.41h4.94v-.73h.14v-.01h4.81c1.5 0 2.21-1.12 2.21-4.38v-2.8C22.05 6.78 20.8 5.5 19.3 5.5h-1.68V7.8c0 1.89-1.6 3.4-3.51 3.4H9.17V9.13h5.79c1.92 0 3.51-1.51 3.51-3.4V5.5C18.47 4 17.5 2 11.91 2z" fill="#387EB8"/>
    <path d="M12.09 22c4.52 0 4.86-2 4.86-3.5v-2.3H12v-.74h6.94c1.5 0 3.06-1.15 3.06-4.39v-2.79c0-1.55-1.25-3.09-2.76-3.09h-1.67v2.32c0 1.89-1.6 3.41-3.52 3.41h-4.94v.73h-.14v.01H4.19c-1.5 0-2.21 1.12-2.21 4.38v2.8C1.98 17.22 3.23 18.5 4.73 18.5h1.68v-2.3c0-1.89 1.6-3.4 3.51-3.4h4.94v2.07H9.07c-1.92 0-3.51 1.51-3.51 3.4v.73c0 1.5.97 3.5 6.53 3.5z" fill="#FFE052"/>
  </svg>
)

const JsIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 rounded-[2px]" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" fill="#F7DF1E" rx="2"/>
    <path d="M12.56 18c.28-.76.7-1.3 1.25-1.64.57-.34 1.18-.45 1.83-.34.6.11.98.41 1.14.9.1.33.09.9-.03 1.7-.06.4-.06.69 0 .86.07.18.23.23.49.16.22-.06.45-.25.68-.58.23-.33.37-.73.42-1.2l1.62.22c-.17 1.05-.62 1.85-1.35 2.4-.73.55-1.66.72-2.8.5-.88-.17-1.57-.59-2.07-1.26-.5-.67-.67-1.55-.5-2.63.13-.8.47-1.42 1.02-1.86.55-.44 1.17-.61 1.85-.48.9.17 1.52.75 1.86 1.74l-1.56.36c-.14-.52-.39-.81-.75-.88-.36-.07-.72 0-1.08.23-.36.22-.57.65-.63 1.28-.11.72-.03 1.21.23 1.48.27.27.65.34 1.16.14.33-.13.52-.35.58-.67v-.36h-1.32v-1.4h2.88v2.96c0 .87-.27 1.53-.8 2-.53.46-1.29.58-2.28.38-.85-.16-1.47-.6-1.85-1.32-.38-.72-.48-1.53-.3-2.42zm-6.2 3.12l1.4-.28c.1.48.33.82.68 1.03.35.21.75.25 1.21.12.45-.1.74-.35.86-.75.12-.4.07-.93-.15-1.59l-.48-1.46c-.08-.24-.2-.55-.36-.93-.16-.38-.28-.7-.37-.96-.09-.26-.14-.52-.16-.78s0-.53.06-.82c.16-1 .62-1.74 1.39-2.22.77-.48 1.69-.6 2.77-.38.86.17 1.52.56 1.98 1.18.46.62.62 1.38.48 2.29l-1.5.24c.05-.53-.08-.94-.39-1.22-.31-.28-.7-.37-1.18-.27-.45.09-.75.33-.9.73-.15.4-.13.88.06 1.45l.48 1.46c.15.45.29.87.42 1.26.13.39.23.74.3 1.05.07.31.09.61.06.9-.03.29-.11.59-.24.9-.23 1.35-.85 2.3-1.86 2.85-1.01.55-2.22.56-3.62.22-.9-.22-1.62-.68-2.16-1.38-.54-.7-.73-1.57-.56-2.61z" fill="#000000"/>
  </svg>
)

const TsIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 rounded-[2px]" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" fill="#3178C6" rx="2"/>
    <path d="M12.56 18c.28-.76.7-1.3 1.25-1.64.57-.34 1.18-.45 1.83-.34.6.11.98.41 1.14.9.1.33.09.9-.03 1.7-.06.4-.06.69 0 .86.07.18.23.23.49.16.22-.06.45-.25.68-.58.23-.33.37-.73.42-1.2l1.62.22c-.17 1.05-.62 1.85-1.35 2.4-.73.55-1.66.72-2.8.5-.88-.17-1.57-.59-2.07-1.26-.5-.67-.67-1.55-.5-2.63.13-.8.47-1.42 1.02-1.86.55-.44 1.17-.61 1.85-.48.9.17 1.52.75 1.86 1.74l-1.56.36c-.14-.52-.39-.81-.75-.88-.36-.07-.72 0-1.08.23-.36.22-.57.65-.63 1.28-.11.72-.03 1.21.23 1.48.27.27.65.34 1.16.14.33-.13.52-.35.58-.67v-.36h-1.32v-1.4h2.88v2.96c0 .87-.27 1.53-.8 2-.53.46-1.29.58-2.28.38-.85-.16-1.47-.6-1.85-1.32-.38-.72-.48-1.53-.3-2.42zm-6.2-3.12v-1.4h5.66v1.4H9.66v8h-1.5v-8H6.36z" fill="#FFFFFF"/>
  </svg>
)

const ReactIcon = ({ color = "#61DAFB" }) => (
  <svg viewBox="-11.5 -10.23174 23 20.46348" className="w-3.5 h-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg">
    <circle cx="0" cy="0" r="2.05" fill={color}/>
    <g stroke={color} strokeWidth="1" fill="none">
      <ellipse rx="11" ry="4.2"/>
      <ellipse rx="11" ry="4.2" transform="rotate(60)"/>
      <ellipse rx="11" ry="4.2" transform="rotate(120)"/>
    </g>
  </svg>
)

const HtmlIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 22L3.5 2h17l2 20L12 25L1.5 22z" fill="#E34F26"/>
    <path d="M12 22.8l8.3-2.3L18.6 4H12v18.8z" fill="#F16529"/>
    <path d="M12 11.2h-3v2.8h3v3.1l-4.2-1.2v-3.1h3v-2.8H7.8V7h8.4l-.2 4.2H12z" fill="#EBEBEB"/>
    <path d="M12 7v4.2h3.9l-.4 3.9l-3.5 1v-3.1h3.1l.1-1.8H12v-4.2h4.2z" fill="#FFFFFF"/>
  </svg>
)

const CssIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 22L3.5 2h17l2 20L12 25L1.5 22z" fill="#1572B6"/>
    <path d="M12 22.8l8.3-2.3L18.6 4H12v18.8z" fill="#33A9DC"/>
    <path d="M12 11.2h-3v2.8h3v3.1l-4.2-1.2V7h8.4l-.2 4.2H12z" fill="#EBEBEB"/>
    <path d="M12 7v4.2h3.9l-.4 3.9l-3.5 1v-3.1H12v-1.8h3.1l.1-1.8H12z" fill="#FFFFFF"/>
  </svg>
)

// Language icon mapping to JSX components
const FILE_ICONS = {
  js: <JsIcon />,
  jsx: <ReactIcon color="#61DAFB" />,
  ts: <TsIcon />,
  tsx: <ReactIcon color="#3178C6" />,
  py: <PyIcon />,
  html: <HtmlIcon />,
  css: <CssIcon />,
  json: <FileCode size={14} className="text-amber-500 shrink-0" />,
  yaml: <FileText size={14} className="text-purple-400 shrink-0" />,
  yml: <FileText size={14} className="text-purple-400 shrink-0" />,
  xml: <FileCode size={14} className="text-orange-400 shrink-0" />,
  toml: <Settings size={14} className="text-blue-400 shrink-0" />,
  md: <FileText size={14} className="text-teal-400 shrink-0" />,
  markdown: <FileText size={14} className="text-teal-400 shrink-0" />,
  sh: <Terminal size={14} className="text-emerald-400 shrink-0" />,
  bash: <Terminal size={14} className="text-emerald-400 shrink-0" />,
  zsh: <Terminal size={14} className="text-emerald-400 shrink-0" />,
  gitignore: <AlertTriangle size={14} className="text-red-400 shrink-0" />,
  txt: <FileText size={14} className="text-gray-400 shrink-0" />,
  log: <FileSpreadsheet size={14} className="text-red-300 shrink-0" />,
}

function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase()
  return FILE_ICONS[ext] || <File size={14} className="text-editor-muted shrink-0" />
}

// Inline input for creating a new file or folder inside a directory node
function InlineCreator({ depth, type, parentPath, projectId, onDone, onRefresh }) {
  const [name, setName] = useState("")
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleConfirm = async () => {
    const trimmed = name.trim()
    if (!trimmed) { onDone(); return }

    const fullPath = parentPath ? `${parentPath}/${trimmed}` : trimmed

    try {
      if (type === "file") {
        await filesApi.write(projectId, fullPath, "")
      } else {
        // Create a .gitkeep to materialise the directory
        await filesApi.write(projectId, `${fullPath}/.gitkeep`, "")
      }
      onRefresh()
    } catch (err) {
      console.error("Create failed", err)
    }
    onDone()
  }

  const handleKey = (e) => {
    if (e.key === "Enter") handleConfirm()
    if (e.key === "Escape") onDone()
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {type === "folder"
        ? <Folder size={13} className="text-yellow-400 shrink-0" />
        : <File size={13} className="text-editor-muted shrink-0" />}
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKey}
        placeholder={type === "folder" ? "folder-name" : "filename.ext"}
        className="flex-1 min-w-0 bg-editor-highlight/80 border border-editor-accent/40 text-white text-[12px] rounded px-2 py-0.5 outline-none placeholder:text-white/30"
      />
      <button
        onClick={handleConfirm}
        className="shrink-0 p-0.5 rounded text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        title="Confirm"
      >
        <Check size={12} />
      </button>
      <button
        onClick={onDone}
        className="shrink-0 p-0.5 rounded text-white/40 hover:bg-white/10 transition-colors"
        title="Cancel"
      >
        <X size={12} />
      </button>
    </div>
  )
}

function TreeNode({ node, projectId, depth = 0, onRefresh }) {
  const [open, setOpen]           = useState(false)
  const [children, setChildren]   = useState([])
  const [creating, setCreating]   = useState(null)   // null | "file" | "folder"
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

  const handleRefresh = async () => {
    const res = await filesApi.list(projectId, node.path)
    setChildren(res.data)
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to delete ${node.name}?`)) return
    try {
      await filesApi.delete(projectId, node.path)
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error("Delete failed", err)
    }
  }

  const startCreate = (e, type) => {
    e.stopPropagation()
    // Ensure folder is open so the inline input shows inside it
    if (!open) {
      filesApi.list(projectId, node.path).then(res => {
        setChildren(res.data)
        setOpen(true)
      })
    } else {
      setOpen(true)
    }
    setCreating(type)
  }

  return (
    <div>
      <div
        className="group flex items-center justify-between gap-1 px-2 py-1 cursor-pointer hover:bg-editor-highlight/60 rounded-md text-[13px] text-editor-text select-none transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {node.is_dir
            ? (open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />)
            : <span className="w-3.5 shrink-0" />}
          {node.is_dir
            ? <Folder size={14} className="text-yellow-400 shrink-0" />
            : getFileIcon(node.name)}
          <span className="truncate">{node.name}</span>
        </div>

        {/* Action buttons — visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {node.is_dir && (
            <>
              <button
                onClick={(e) => startCreate(e, "file")}
                className="p-1 rounded text-editor-muted hover:text-editor-accent hover:bg-editor-accent/10 transition-colors"
                title="New file here"
              >
                <FilePlus size={12} />
              </button>
              <button
                onClick={(e) => startCreate(e, "folder")}
                className="p-1 rounded text-editor-muted hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                title="New folder here"
              >
                <FolderPlus size={12} />
              </button>
            </>
          )}
          <button
            onClick={handleDelete}
            className="p-1 rounded text-editor-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title={`Delete ${node.name}`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {open && (
        <>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              projectId={projectId}
              depth={depth + 1}
              onRefresh={handleRefresh}
            />
          ))}
          {creating && (
            <InlineCreator
              depth={depth + 1}
              type={creating}
              parentPath={node.path}
              projectId={projectId}
              onDone={() => setCreating(null)}
              onRefresh={handleRefresh}
            />
          )}
        </>
      )}
    </div>
  )
}

export default function FileTree() {
  const project = useProjectStore((s) => s.activeProject)
  const { dirtyPaths, clearDirty, syncing } = useFileTreeStore()
  const [roots, setRoots]     = useState([])
  const [loading, setLoading] = useState(false)
  const [rootCreating, setRootCreating] = useState(null) // null | "file" | "folder"
  const fileInputRef   = useRef(null)
  const folderInputRef = useRef(null)

  const refreshRoots = async () => {
    if (!project) return
    setLoading(true)
    try {
      const r = await filesApi.list(project.id)
      setRoots(r.data)
    } catch (err) {
      console.error("Refresh failed", err)
    } finally {
      setLoading(false)
    }
  }

  // Re-fetch root when any file changes
  useEffect(() => {
    if (dirtyPaths.length === 0) return
    refreshRoots()
    clearDirty()
  }, [dirtyPaths])

  useEffect(() => {
    if (!project) return
    setLoading(true)
    filesApi.list(project.id)
      .then((r) => setRoots(r.data))
      .finally(() => setLoading(false))
  }, [project])

  const handleUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click()
  }

  const handleFolderUploadClick = () => {
    if (folderInputRef.current) folderInputRef.current.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !project) return
    try {
      await filesApi.upload(project.id, file.name, file)
      refreshRoots()
    } catch (err) {
      console.error("Upload failed", err)
    }
    e.target.value = ""
  }

  const handleFolderChange = async (e) => {
    const files = e.target.files
    if (!files || !project) return
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const relativePath = file.webkitRelativePath || file.name
        await filesApi.upload(project.id, relativePath, file)
      }
      refreshRoots()
    } catch (err) {
      console.error("Folder upload failed", err)
    }
    e.target.value = ""
  }

  if (!project) return (
    <div className="p-4 text-editor-muted text-xs">No project open</div>
  )

  if (loading) return (
    <div className="p-4 text-editor-muted text-xs">Loading...</div>
  )

  return (
    <div className="h-full overflow-y-auto py-2">
      <div className="flex items-center justify-between px-3 py-1 mb-1">
        <span className="text-xs text-editor-muted uppercase tracking-wider font-semibold">
          {project.name}
          {syncing && <span className="ml-2 text-yellow-400 text-xs">syncing...</span>}
        </span>
        <div className="flex items-center gap-2">
          <RefreshCw
            size={14}
            className={`text-editor-muted hover:text-editor-text cursor-pointer transition-transform ${
              syncing ? "animate-spin" : ""
            }`}
            onClick={refreshRoots}
            title="Refresh file tree"
          />
          {/* New file at root */}
          <FilePlus
            size={14}
            className="text-editor-muted hover:text-editor-accent cursor-pointer transition-colors"
            onClick={() => setRootCreating("file")}
            title="New file at root"
          />
          {/* New folder at root */}
          <FolderPlus
            size={14}
            className="text-editor-muted hover:text-yellow-400 cursor-pointer transition-colors"
            onClick={() => setRootCreating("folder")}
            title="New folder at root"
          />
          <FolderOpen
            size={14}
            className="text-editor-muted hover:text-editor-text cursor-pointer"
            onClick={handleFolderUploadClick}
            title="Upload folder to project"
          />
          <Upload
            size={14}
            className="text-editor-muted hover:text-editor-text cursor-pointer"
            onClick={handleUploadClick}
            title="Upload file to project root"
          />
        </div>
      </div>
      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
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

      {roots.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          projectId={project.id}
          onRefresh={refreshRoots}
        />
      ))}

      {/* Inline creator at root level */}
      {rootCreating && (
        <InlineCreator
          depth={0}
          type={rootCreating}
          parentPath=""
          projectId={project.id}
          onDone={() => setRootCreating(null)}
          onRefresh={refreshRoots}
        />
      )}
    </div>
  )
}