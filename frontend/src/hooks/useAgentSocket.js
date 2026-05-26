import { useRef, useCallback } from "react"
import { useChatStore } from "../stores/chatStore"
import { useAuthStore } from "../stores/authStore"
import { useEditorStore } from "../stores/editorStore"
import { useFileTreeStore } from "../stores/fileTreeStore"
export function useAgentSocket(projectId) {
  const wsRef = useRef(null)
  const messageQueueRef = useRef([])
  const { addMessage, appendToken, flushBuffer,
          setStreaming, setConversationId } = useChatStore()
  const token = useAuthStore((s) => s.token)

  const connect = useCallback(() => {
    if (!projectId) return                                        // no project yet
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return

    const url = `ws://127.0.0.1:1842/api/agent/ws/${projectId}?token=${token}`
    const ws  = new WebSocket(url)

    ws.onopen = () => {
      while (messageQueueRef.current.length > 0) {
        const msg = messageQueueRef.current.shift()
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
        addMessage({ id: crypto.randomUUID(), role: "error", content: msg.message })
      }
    }

    ws.onerror = () =>
      addMessage({ id: crypto.randomUUID(), role: "error", content: "WebSocket error" })

    wsRef.current = ws
  }, [projectId, token, addMessage, appendToken, flushBuffer, setConversationId, setStreaming])

  const sendMessage = useCallback((text) => {
      const { conversationId } = useChatStore.getState()
      const openFiles = useEditorStore.getState().openFiles.map((f) => f.path)

      addMessage({ id: crypto.randomUUID(), role: "user", content: text })
      const payload = {
          message:         text,
          conversation_id: conversationId,
          open_files:      openFiles,
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(payload))
      } else {
          messageQueueRef.current.push(payload)
          connect()
      }
  }, [connect, addMessage])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
  }, [])

  return { sendMessage, connect, disconnect }
}