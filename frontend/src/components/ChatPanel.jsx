import { useEffect, useRef, useState } from "react"
import { Send, Wrench, Bot, User, AlertCircle, Sparkles, Info } from "lucide-react"
import { useChatStore } from "../stores/chatStore"
import { useProjectStore } from "../stores/projectStore"
import { useAgentSocket } from "../hooks/useAgentSocket"
import Markdown from "./Markdown"

function MessageBubble({ msg }) {
  const isUser   = msg.role === "user"
  const isTool   = msg.role === "tool_start" || msg.role === "tool_end"
  const isSystem = msg.role === "system"

  // System messages: slim horizontal notification bar, not a bubble
  if (isSystem) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-editor-highlight/30 border border-editor-border/30 text-editor-muted text-[11px] self-stretch">
        <Info size={12} className="shrink-0 text-editor-muted/70" />
        <Markdown text={msg.content} />
      </div>
    )
  }

  const icons = {
    user:       <User size={14} className="text-white" />,
    assistant:  <Bot  size={14} className="text-editor-accent" />,
    tool_start: <Wrench size={12} className="text-yellow-400" />,
    tool_end:   <Wrench size={12} className="text-green-400" />,
    error:      <AlertCircle size={14} className="text-red-400" />,
  }

  const styles = {
    user:       "bg-gradient-to-br from-blue-600 to-indigo-600 text-white self-end shadow-lg shadow-blue-500/20 border border-blue-500/20",
    assistant:  "bg-editor-highlight/50 backdrop-blur-md text-editor-text self-start border border-editor-border/50 shadow-sm",
    tool_start: "bg-transparent border border-editor-border/30 text-editor-muted self-start text-[11px] opacity-70",
    tool_end:   "bg-transparent border border-editor-border/30 text-editor-muted self-start text-[11px] opacity-70",
    error:      "bg-red-900/20 border border-red-500/30 text-red-300 self-start shadow-sm",
  }

  return (
    <div className={`flex items-start gap-3 px-3.5 py-2.5 rounded-2xl max-w-[92%] ${styles[msg.role] ?? styles.assistant} ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
      {!isTool && (
        <div className={`mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full ${isUser ? 'bg-white/20' : 'bg-editor-accent/10'}`}>
          {icons[msg.role]}
        </div>
      )}
      {isTool && <div className="mt-0.5 shrink-0">{icons[msg.role]}</div>}
      <div className="flex-1 min-w-0 text-[13px] leading-relaxed">
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

  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile")
  const supportedModels = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "deepseek-r1-distill-llama-70b",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-32b"
  ]

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
    sendMessage(text, selectedModel)

    const textarea = document.getElementById("chat-input-textarea")
    if (textarea) {
        textarea.style.height = 'auto'
    }
  }

  return (
    <div className="flex flex-col h-full bg-editor-sidebar/95 backdrop-blur-xl border-l border-editor-border/50 shadow-[-8px_0_24px_rgba(0,0,0,0.2)] z-30 relative">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 h-12 border-b border-editor-border/50 bg-editor-bg/50 shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Sparkles size={14} className="text-editor-accent" />
        </div>
        <span className="text-[13px] font-bold text-white tracking-wide uppercase">AI Assistant</span>
        
        <select 
          className="ml-auto bg-editor-bg border border-editor-border text-[11px] text-editor-muted rounded px-2 py-0.5 outline-none hover:border-editor-accent/50 focus:border-editor-accent/80 transition-colors max-w-[140px] truncate cursor-pointer"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          {supportedModels.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {isStreaming && (
          <span className="ml-2 text-[10px] font-mono text-editor-accent animate-pulse uppercase tracking-widest bg-editor-accent/10 px-2 py-0.5 rounded-full border border-editor-accent/20">Thinking</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 opacity-50">
            <Bot size={48} className="text-editor-muted mb-4" />
            <h3 className="text-white font-medium mb-1">How can I help?</h3>
            <p className="text-editor-muted text-xs max-w-[200px]">
              Ask me to write code, debug issues, or explore the codebase.
            </p>
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        
        {streamBuffer && (
          <div className="flex items-start gap-3 px-3.5 py-2.5 rounded-2xl rounded-tl-sm max-w-[92%] bg-editor-highlight/50 backdrop-blur-md text-editor-text self-start border border-editor-border/50 shadow-sm">
            <div className="mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-editor-accent/10">
              <Bot size={14} className="text-editor-accent" />
            </div>
            <div className="flex-1 min-w-0 text-[13px] leading-relaxed">
              <Markdown text={streamBuffer} />
              <span className="animate-pulse inline-block ml-1 text-editor-accent font-bold">▋</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-2 shrink-0" />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-editor-border/50 bg-editor-bg/30 backdrop-blur-md">
        <div className="flex gap-2 items-end bg-editor-bg border border-editor-border hover:border-editor-accent/50 focus-within:border-editor-accent/80 focus-within:shadow-[0_0_15px_rgba(122,162,247,0.15)] rounded-xl px-3 py-2.5 transition-all">
          <textarea
            id="chat-input-textarea"
            className="flex-1 bg-transparent text-white text-[13px] resize-none outline-none max-h-40 min-h-[20px] placeholder:text-editor-muted"
            placeholder="Message the agent..."
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
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
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-editor-accent hover:bg-editor-accentHover text-editor-bg disabled:bg-editor-highlight disabled:text-editor-muted transition-colors shrink-0 mb-0.5 shadow-md disabled:shadow-none"
          >
            <Send size={14} className={!isStreaming && input.trim() ? "translate-x-px -translate-y-px" : ""} />
          </button>
        </div>
        <div className="flex justify-between items-center mt-2 px-1">
          <p className="text-[10px] text-editor-muted/70 font-medium">Use <kbd className="bg-editor-highlight px-1 rounded border border-editor-border">Shift+Enter</kbd> for newline</p>
        </div>
      </div>
    </div>
  )
}