import React from "react"

function renderInlineMarkdown(text) {
  if (!text) return ""
  
  // Split on bold text (**bold**) and inline code (`code`)
  const regex = /(\*\*.*?\*\*|`.*?`)/g
  const parts = text.split(regex)
  
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-bold text-editor-text border-b border-editor-muted/20 pb-[1px]">
          {part.slice(2, -2)}
        </strong>
      )
    } else if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={idx} className="px-1.5 py-0.5 rounded bg-editor-highlight border border-editor-border text-yellow-300 font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      )
    } else {
      return part
    }
  })
}

export default function Markdown({ text }) {
  if (!text) return null

  // Split by code blocks: ```[language]\n[code]```
  const parts = text.split(/(```[\s\S]*?```)/g)

  return (
    <div className="flex flex-col gap-2.5 leading-relaxed text-sm">
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          // Parse language and code content
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/)
          const lang = match ? match[1] : ""
          const code = match ? match[2].trim() : part.slice(3, -3).trim()

          return (
            <div
              key={index}
              className="my-1.5 rounded-md bg-[#161616] border border-editor-border overflow-hidden shadow-sm"
            >
              {lang && (
                <div className="bg-editor-sidebar px-3 py-1.5 border-b border-editor-border text-[10px] uppercase font-mono tracking-wider font-semibold text-editor-muted flex justify-between items-center select-none">
                  <span>{lang}</span>
                </div>
              )}
              <pre className="p-3 text-xs overflow-x-auto font-mono text-editor-text whitespace-pre bg-black/15">
                <code>{code}</code>
              </pre>
            </div>
          )
        } else {
          // Render paragraphs
          return (
            <p key={index} className="whitespace-pre-wrap break-words">
              {renderInlineMarkdown(part)}
            </p>
          )
        }
      })}
    </div>
  )
}
