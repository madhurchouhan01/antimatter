import { useEffect, useRef, useState } from "react"
import { Send, Wrench, Bot, User, AlertCircle } from "lucide-react"
import { useChatStore } from "../stores/chatStore"
import { useProjectStore } from "../stores/projectStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import Markdown from "./Markdown"

function MessageBubble({ msg }) {
  const icons = {
    user:       <User size={14} />,
    assistant:  <Bot  size={14} />,
    tool_start: <Wrench size={14} className="text-yellow-400" />,
    tool_end:   <Wrench size={14} className="text-green-400" />,
    error:      <AlertCircle size={14} className="text-red-400" />,
  }

  const colors = {
    user:       "bg-editor-accent text-white self-end",
    assistant:  "bg-editor-highlight text-editor-text self-start",
    tool_start: "bg-transparent border border-editor-border text-editor-muted self-start text-xs",
    tool_end:   "bg-transparent border border-editor-border text-editor-muted self-start text-xs",
    error:      "bg-red-900/30 text-red-400 self-start",
  }

  return (
    <div className={`flex items-start gap-2.5 px-3 py-2 rounded-lg max-w-[90%] ${colors[msg.role] ?? colors.assistant}`}>
      <span className="mt-0.5 shrink-0">{icons[msg.role]}</span>
      <div className="flex-1 min-w-0">
        <Markdown text={msg.content} />
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const project   = useProjectStore((s) => s.activeProject)
  const { messages, isStreaming, streamBuffer } = useChatStore()
  const { sendMessage, connect, disconnect } = useAgentSocket(project?.id)
  const [input, setInput] = useState("")
  const bottomRef = useRef(null)

  useEffect(() => {
    if (project) connect()
  }, [project?.id, connect])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamBuffer])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput("")
    sendMessage(text)

    const textarea = document.getElementById("chat-input-textarea")
    if (textarea) {
        textarea.style.height = 'auto'
    }
  }

  return (
    <div className="flex flex-col h-full bg-editor-panel border-l border-editor-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-editor-border">
        <Bot size={16} className="text-blue-400" />
        <span className="text-sm font-semibold text-editor-text">AI Assistant</span>
        {isStreaming && (
          <span className="ml-auto text-xs text-editor-muted animate-pulse">thinking...</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="text-editor-muted text-sm text-center mt-8">
            Ask me to read, write, or run anything in your project.
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        {streamBuffer && (
          <div className="bg-editor-highlight text-editor-text self-start px-3 py-2 rounded-lg max-w-[90%] text-sm flex gap-2.5 items-start">
            <span className="mt-0.5 shrink-0 text-blue-400"><Bot size={14} /></span>
            <div className="flex-1 min-w-0">
              <Markdown text={streamBuffer} />
              <span className="animate-pulse inline-block ml-0.5 text-blue-400 font-bold">▌</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-editor-border">
        <div className="flex gap-2 items-end bg-editor-highlight rounded-lg px-3 py-2">
          <textarea
            id="chat-input-textarea"
            className="flex-1 bg-transparent text-editor-text text-sm resize-none outline-none max-h-40 min-h-[24px]"
            placeholder="Ask the agent..."
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="text-blue-400 hover:text-blue-300 disabled:opacity-30 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-xs text-editor-muted mt-1 pl-1">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  )
}