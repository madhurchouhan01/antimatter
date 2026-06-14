import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import mermaid from "mermaid"
import { Maximize2, X, Download } from "lucide-react"
import { useChatStore } from "../stores/chatStore"

import "highlight.js/styles/github-dark.css"

// ─── Mermaid initialisation (once, module-level) ────────────────────────────
mermaid.initialize({
  startOnLoad: false,
  suppressErrorRendering: true,
  theme: "dark",
  themeVariables: {
    background: "#0d0d14",
    primaryColor: "#6366f1",
    primaryTextColor: "#e2e8f0",
    primaryBorderColor: "#4f46e5",
    lineColor: "#6366f1",
    secondaryColor: "#1e1b4b",
    tertiaryColor: "#1e1e2e",
    edgeLabelBackground: "#1e1e2e",
    clusterBkg: "#1e1b4b",
    titleColor: "#e2e8f0",
    nodeBorder: "#4f46e5",
    mainBkg: "#1e1e2e",
    nodeTextColor: "#e2e8f0",
    fontFamily: "Inter, ui-sans-serif, system-ui",
  },
  flowchart: { curve: "basis", useMaxWidth: true },
  sequence: { useMaxWidth: true },
})

let _mermaidCounter = 0

// ─── Module-level cache for rendered Mermaid SVGs ─────────────────────────────
const mermaidSvgCache = new Map()

// ─── MermaidDiagram Component ─────────────────────────────────────────────────
const MermaidDiagram = React.memo(function MermaidDiagram({ code }) {
  const containerRef = useRef(null)
  const [error, setError] = useState(null)
  const [svg, setSvg] = useState(() => mermaidSvgCache.get(code) || null)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState("diagram")
  const [fsView, setFsView] = useState("diagram")
  const isStreaming = useChatStore((s) => s.isStreaming)

  useEffect(() => {
    const cached = mermaidSvgCache.get(code)
    if (cached) {
      setSvg(cached)
      setError(null)
      return
    }

    let cancelled = false
    setError(null)
    setSvg(null)

    const id = `mermaid-${Date.now()}-${++_mermaidCounter}`
    ;(async () => {
      try {
        const { svg: rendered } = await mermaid.render(id, code)
        if (!cancelled) {
          mermaidSvgCache.set(code, rendered)
          setSvg(rendered)
        }
      } catch (err) {
        if (!cancelled) setError(String(err?.message ?? err))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [code])

  // Esc key to close fullscreen modal
  useEffect(() => {
    if (!isFullScreen) return
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsFullScreen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isFullScreen])

  // Reset zoom and view when toggling full screen
  useEffect(() => {
    if (isFullScreen) {
      setZoom(1)
      setFsView("diagram")
    }
  }, [isFullScreen])

  const handleDownloadSVG = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `mermaid-diagram-${Date.now()}.svg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Only show error if we are not currently streaming tokens
  if (error && !isStreaming) {
    return (
      <div className="my-3 rounded-xl border border-red-500/30 bg-red-950/30 p-4">
        <p className="text-xs font-mono text-red-400 mb-1 font-semibold">Mermaid render error</p>
        <pre className="text-[11px] text-red-300/80 whitespace-pre-wrap">{error}</pre>
        <details className="mt-2">
          <summary className="text-[10px] text-editor-muted/60 cursor-pointer hover:text-editor-muted">Show source</summary>
          <pre className="mt-1 text-[11px] text-editor-muted/70 whitespace-pre-wrap overflow-x-auto">{code}</pre>
        </details>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-3 rounded-xl border border-editor-border/40 bg-[#0d0d14] p-6 flex items-center justify-center">
        <span className="text-[11px] text-editor-muted/60 animate-pulse">Rendering diagram…</span>
      </div>
    )
  }

  return (
    <>
      <div className="my-3 rounded-xl border border-editor-border/40 bg-[#0d0d14] overflow-hidden shadow-lg">
        <div className="flex items-center justify-between px-4 py-2 bg-editor-sidebar/80 border-b border-editor-border/30">
          <button
            onClick={() => setView(view === "diagram" ? "raw" : "diagram")}
            className="text-[10px] uppercase tracking-widest text-indigo-400/80 font-mono font-semibold hover:text-indigo-300 transition-colors"
          >
            {view === "diagram" ? "raw" : "diagram"}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDownloadSVG}
              className="p-1 hover:bg-editor-highlight/50 rounded text-editor-muted hover:text-white transition-colors"
              title="Download SVG"
            >
              <Download size={13} />
            </button>
            <button
              onClick={() => setIsFullScreen(true)}
              className="p-1 hover:bg-editor-highlight/50 rounded text-editor-muted hover:text-white transition-colors"
              title="Fullscreen"
            >
              <Maximize2 size={13} />
            </button>
            <CopyButton text={code} />
          </div>
        </div>
        {view === "diagram" ? (
          <div
            ref={containerRef}
            className="p-4 overflow-x-auto flex justify-center [&>svg]:max-w-full [&>svg]:h-auto cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setIsFullScreen(true)}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="p-4 bg-[#09090e]/50 max-h-96 overflow-auto">
            <pre className="text-[11px] text-editor-text/90 font-mono whitespace-pre-wrap leading-relaxed select-all">
              <code>{code}</code>
            </pre>
          </div>
        )}
      </div>

      {isFullScreen && createPortal(
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-8 animate-in fade-in duration-200"
          onClick={() => setIsFullScreen(false)}
        >
          <div 
            className="relative w-full h-full max-w-6xl max-h-[90vh] bg-[#09090e]/95 border border-indigo-500/20 rounded-2xl flex flex-col shadow-[0_0_50px_rgba(99,102,241,0.15)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#0d0d14]/90 border-b border-editor-border/30 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-sm font-semibold text-white tracking-wide">Mermaid Diagram Viewer</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFsView(fsView === "diagram" ? "raw" : "diagram")}
                  className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/30 rounded-lg text-indigo-200 text-xs font-medium transition-colors"
                >
                  {fsView === "diagram" ? "View Raw Code" : "View Diagram"}
                </button>
                <button
                  onClick={handleDownloadSVG}
                  className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/30 rounded-lg text-indigo-200 text-xs font-medium transition-colors flex items-center gap-1.5"
                  title="Download SVG"
                >
                  <Download size={13} />
                  <span>Download SVG</span>
                </button>
                <button
                  onClick={() => setIsFullScreen(false)}
                  className="p-1.5 hover:bg-editor-highlight rounded-lg text-editor-muted hover:text-white transition-colors"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Zoom controls (only show in diagram view) */}
            {fsView === "diagram" && (
              <div className="flex items-center justify-center gap-4 py-2 px-6 bg-[#0c0c12]/80 border-b border-editor-border/20 shrink-0 select-none">
                <button
                  onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                  className="w-7 h-7 flex items-center justify-center bg-[#1e1e2f] border border-editor-border rounded-md text-editor-muted hover:text-white transition-colors text-sm font-bold"
                >
                  -
                </button>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-32 accent-indigo-500 cursor-pointer"
                />
                <button
                  onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                  className="w-7 h-7 flex items-center justify-center bg-[#1e1e2f] border border-editor-border rounded-md text-editor-muted hover:text-white transition-colors text-sm font-bold"
                >
                  +
                </button>
                <span className="text-[11px] font-mono text-editor-muted w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom(1)}
                  className="px-2 py-1 bg-[#1e1e2f] border border-editor-border rounded-md text-[10px] text-editor-muted hover:text-white transition-colors font-medium"
                >
                  Reset
                </button>
              </div>
            )}

            {/* Diagram/Raw Area */}
            <div className="flex-1 overflow-auto bg-[#07070a] p-8 flex min-h-0">
              {fsView === "diagram" ? (
                <div 
                  className="m-auto flex items-center justify-center shrink-0 [&>svg]:!w-full [&>svg]:!h-auto [&>svg]:!max-w-none shadow-lg rounded-lg bg-[#0d0d14]/30 p-4 border border-editor-border/10"
                  style={{ 
                    width: `${zoom * 100}%`,
                    minWidth: '100%'
                  }}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <div className="m-auto w-full max-w-3xl bg-[#0d0d14]/80 border border-editor-border/40 rounded-xl p-6 relative">
                  <div className="absolute top-4 right-4">
                    <CopyButton text={code} />
                  </div>
                  <pre className="text-[12px] text-editor-text font-mono whitespace-pre-wrap leading-relaxed select-all">
                    <code>{code}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
})

const MARKDOWN_COMPONENTS = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mt-5 mb-3 text-white border-b border-editor-border/40 pb-2">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[15px] font-semibold mt-4 mb-2 text-white">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[13px] font-semibold mt-3 mb-1.5 text-white/90">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-[13px] font-semibold mt-2 mb-1 text-white/80">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-xs font-semibold mt-2 mb-1 text-editor-muted">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-xs font-semibold mt-1 mb-1 text-editor-muted/70">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="mb-3 last:mb-0 leading-[1.75] text-[13px] text-editor-text/90">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white">
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic text-gray-300">
      {children}
    </em>
  ),
  del: ({ children }) => (
    <del className="line-through opacity-60">
      {children}
    </del>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-editor-accent/60 pl-4 my-3 text-editor-muted/80 italic bg-editor-accent/5 py-2 rounded-r-md">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="list-none pl-0 mb-3 last:mb-0 space-y-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 last:mb-0 space-y-1 marker:text-editor-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 leading-relaxed text-[13px] text-editor-text/90">
      <span className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-editor-accent/60 ring-1 ring-editor-accent/20"></span>
      <span>{children}</span>
    </li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline underline-offset-2 decoration-blue-400/50"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt}
      className="rounded-lg border border-editor-border my-4 max-w-full"
    />
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-editor-border/50">
      <table className="min-w-full">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-editor-sidebar border-b border-editor-border/50">
      {children}
    </thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-editor-border/30">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-editor-highlight/20 transition-colors">
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-editor-muted uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-[12px] text-editor-text/80">
      {children}
    </td>
  ),
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "")
    const lang = match?.[1]
    const content = String(children).replace(/\n$/, "")
    const isInline = inline || (!match && !content.includes("\n"))

    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded-md bg-editor-highlight border border-editor-border/60 text-amber-300/90 font-mono text-[11px] whitespace-nowrap"
          {...props}
        >
          {children}
        </code>
      )
    }

    if (lang === "mermaid") {
      return <MermaidDiagram code={content} />
    }

    return (
      <div className="my-3 last:mb-0 rounded-xl overflow-hidden border border-editor-border/40 bg-[#0d0d14] shadow-lg">
        <div className="flex items-center justify-between px-4 py-2 bg-editor-sidebar/80 border-b border-editor-border/30">
          <span className="text-[10px] uppercase tracking-widest text-editor-muted/70 font-mono font-semibold">
            {lang ?? "code"}
          </span>
          <CopyButton text={content} />
        </div>
        <pre className="overflow-x-auto p-4 text-[12px] leading-[1.6]">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    )
  },
  hr: () => (
    <hr className="my-5 border-editor-border/40" />
  ),
}

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeHighlight]

const Markdown = React.memo(function Markdown({ text }) {
  if (!text) return null

  return (
    <div className="markdown-body text-sm leading-[1.75] text-editor-text break-words">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

export default Markdown

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="text-[10px] font-mono text-editor-muted/60 hover:text-editor-muted transition-colors px-2 py-0.5 rounded hover:bg-editor-highlight/50"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}
