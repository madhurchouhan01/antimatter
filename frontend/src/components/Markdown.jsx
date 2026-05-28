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
            <h1 className="text-4xl font-bold mt-8 mb-4 border-b border-editor-border pb-2">
              {children}
            </h1>
          ),

          h2: ({ children }) => (
            <h2 className="text-3xl font-semibold mt-7 mb-3 border-b border-editor-border pb-2">
              {children}
            </h2>
          ),

          h3: ({ children }) => (
            <h3 className="text-2xl font-semibold mt-6 mb-3">
              {children}
            </h3>
          ),

          h4: ({ children }) => (
            <h4 className="text-xl font-semibold mt-5 mb-2">
              {children}
            </h4>
          ),

          h5: ({ children }) => (
            <h5 className="text-lg font-semibold mt-4 mb-2">
              {children}
            </h5>
          ),

          h6: ({ children }) => (
            <h6 className="text-base font-semibold mt-4 mb-2 text-editor-muted">
              {children}
            </h6>
          ),

          p: ({ children }) => (
            <p className="my-3 whitespace-pre-wrap">
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
            <blockquote className="border-l-4 border-editor-border pl-4 italic text-editor-muted my-4">
              {children}
            </blockquote>
          ),

          ul: ({ children }) => (
            <ul className="list-disc pl-6 my-3 space-y-1">
              {children}
            </ul>
          ),

          ol: ({ children }) => (
            <ol className="list-decimal pl-6 my-3 space-y-1">
              {children}
            </ol>
          ),

          li: ({ children }) => (
            <li className="leading-7">
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
              <div className="my-4 rounded-lg overflow-hidden border border-editor-border bg-[#161616]">
                {match?.[1] && (
                  <div className="px-3 py-2 text-[11px] uppercase tracking-wider bg-editor-sidebar border-b border-editor-border text-editor-muted font-mono">
                    {match[1]}
                  </div>
                )}

                <pre className="overflow-x-auto p-4 text-sm">
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
