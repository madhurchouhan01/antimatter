import { useCallback } from "react"
import { useChatStore } from "../stores/chatStore"
import { useAuthStore } from "../stores/authStore"
import { useEditorStore } from "../stores/editorStore"
import { useFileTreeStore } from "../stores/fileTreeStore"
import { useDiffStore } from "../stores/diffStore"

let globalWs = null
const messageQueue = []

export function useAgentSocket(projectId) {
  const { addMessage, appendToken, flushBuffer,
          setStreaming, setConversationId } = useChatStore()
  const token = useAuthStore((s) => s.token)

  const connect = useCallback(() => {
    if (!projectId) return                                        // no project yet
    if (globalWs?.readyState === WebSocket.OPEN) return
    if (globalWs?.readyState === WebSocket.CONNECTING) return

    const url = `ws://127.0.0.1:1842/api/agent/ws/${projectId}?token=${token}`
    const ws  = new WebSocket(url)
    globalWs = ws

    ws.onopen = () => {
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift()
        ws.send(JSON.stringify(msg))
      }
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === "file.changed") {
          // Trigger file tree refresh for the changed path
          useFileTreeStore.getState().markDirty(msg.path, msg.event)
          return
      }
      if (msg.type === "indexing.status") {
          useFileTreeStore.getState().setIndexing(msg.status)
          return
      }
      if (msg.type === "file.patch") {
          // AI proposed a file change — add to pendingDiffs
          useDiffStore.getState().addPendingDiff(msg.path, msg.original, msg.modified)
          return
      }
      if (msg.type === "token") {
        setStreaming(true)
        appendToken(msg.content)
      } else if (msg.type === "tool_start") {
        addMessage({
          id:   crypto.randomUUID(),
          role: "tool_start",
          content: `Running **${msg.tool}**`,
          tool: msg.tool,
          input: msg.input,
        })
      } else if (msg.type === "tool_end") {
        addMessage({
          id:      crypto.randomUUID(),
          role:    "tool_end",
          content: msg.output,
          tool:    msg.tool,
        })
      } else if (msg.type === "done") {
        flushBuffer()
        setConversationId(msg.conversation_id)
      } else if (msg.type === "error") {
        addMessage({ id: crypto.randomUUID(), role: "error", content: msg.message, error_type: msg.error_type })
      }
    }

    ws.onerror = (e) => {
      console.error("Agent socket error:", e)
      // addMessage({ id: crypto.randomUUID(), role: "error", content: "WebSocket error" })
    }

    ws.onclose = () => {
      if (globalWs === ws) {
        globalWs = null
      }
    }
  }, [projectId, token, addMessage, appendToken, flushBuffer, setConversationId, setStreaming])

  const sendMessage = useCallback((text, model = "llama-3.3-70b-versatile", options = {}) => {
      const { conversationId } = useChatStore.getState()
      const openFiles = useEditorStore.getState().openFiles.map((f) => f.path)

      if (!options.hidden) {
        addMessage({ id: crypto.randomUUID(), role: options.role || "user", content: text })
      }
      const payload = {
          message:         text,
          model:           model,
          conversation_id: conversationId,
          open_files:      openFiles,
      }

      if (globalWs?.readyState === WebSocket.OPEN) {
          globalWs.send(JSON.stringify(payload))
      } else {
          messageQueue.push(payload)
          connect()
      }
  }, [connect, addMessage])

  const disconnect = useCallback(() => {
    globalWs?.close()
    globalWs = null
  }, [])

  return { sendMessage, connect, disconnect }
}