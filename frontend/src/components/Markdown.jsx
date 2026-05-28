import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"

import "highlight.js/styles/github-dark.css"

export default function Markdown({ text }) {
  if (!text) return null

  return (
    <div className="markdown-body text-sm leading-7 text-editor-text break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-4 mb-2 border-b border-editor-border/50 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold mt-3 mb-2 border-b border-editor-border/50 pb-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold mt-2 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold mt-2 mb-1">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-sm font-semibold mt-1 mb-1">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-xs font-semibold mt-1 mb-1 text-editor-muted">
              {children}
            </h6>
          ),
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 whitespace-pre-wrap leading-relaxed">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-white">
              {children}
            </strong>
          ),

          em: ({ children }) => (
            <em className="italic text-gray-200">
              {children}
            </em>
          ),

          del: ({ children }) => (
            <del className="line-through opacity-70">
              {children}
            </del>
          ),

          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-blue-500 pl-3 italic text-editor-muted/80 my-2">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">
              {children}
            </li>
          ),

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
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
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-editor-border">
                {children}
              </table>
            </div>
          ),

          thead: ({ children }) => (
            <thead className="bg-editor-sidebar">
              {children}
            </thead>
          ),

          tbody: ({ children }) => (
            <tbody>{children}</tbody>
          ),

          tr: ({ children }) => (
            <tr className="border-b border-editor-border">
              {children}
            </tr>
          ),

          th: ({ children }) => (
            <th className="px-4 py-2 text-left font-semibold border-r border-editor-border">
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td className="px-4 py-2 border-r border-editor-border">
              {children}
            </td>
          ),

          inlineCode: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded bg-editor-highlight border border-editor-border text-yellow-300 font-mono text-xs">
              {children}
            </code>
          ),

          code({ inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "")

            if (inline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-editor-highlight border border-editor-border text-yellow-300 font-mono text-xs">
                  {children}
                </code>
              )
            }

            return (
              <div className="my-2 last:mb-0 rounded-lg overflow-hidden border border-editor-border/50 bg-[#121212] shadow-sm">
                {match?.[1] && (
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider bg-editor-sidebar border-b border-editor-border/50 text-editor-muted font-mono flex items-center justify-between">
                    <span>{match[1]}</span>
                  </div>
                )}
                <pre className="overflow-x-auto p-3 text-[12px] leading-tight">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            )
          },

          hr: () => (
            <hr className="my-6 border-editor-border" />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
