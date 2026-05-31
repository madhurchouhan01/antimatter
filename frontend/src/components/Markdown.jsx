import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { useState } from "react"

import "highlight.js/styles/github-dark.css"

export default function Markdown({ text }) {
  if (!text) return null

  return (
    <div className="markdown-body text-sm leading-[1.75] text-editor-text break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
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
            const content = String(children).replace(/\n$/, "")
            // Treat as inline if inline=true OR single-line with no language hint
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

            return (
              <div className="my-3 last:mb-0 rounded-xl overflow-hidden border border-editor-border/40 bg-[#0d0d14] shadow-lg">
                <div className="flex items-center justify-between px-4 py-2 bg-editor-sidebar/80 border-b border-editor-border/30">
                  <span className="text-[10px] uppercase tracking-widest text-editor-muted/70 font-mono font-semibold">
                    {match?.[1] ?? "code"}
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
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

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
