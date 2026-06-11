import { useCallback } from "react"
import { useChatStore } from "../stores/chatStore"
import { useAuthStore } from "../stores/authStore"
import { useEditorStore } from "../stores/editorStore"
import { useFileTreeStore } from "../stores/fileTreeStore"
import { useDiffStore } from "../stores/diffStore"
import { useSettingsStore } from "../stores/settingsStore"
import { filesApi } from "../lib/api"

/** Calculate line diff stats and generate a summary */
function generateSummary(pendingDiffs) {
  const entries = Object.entries(pendingDiffs)
  if (entries.length === 0) return null

  let totalLinesAdded = 0
  let totalLinesRemoved = 0
  const fileChanges = []

  for (const [path, diff] of entries) {
    const originalLines = diff.original.split("\n").length
    const modifiedLines = diff.modified.split("\n").length
    const added = Math.max(0, modifiedLines - originalLines)
    const removed = Math.max(0, originalLines - modifiedLines)
    
    totalLinesAdded += added
    totalLinesRemoved += removed
    
    const filename = path.split("/").pop()
    fileChanges.push({
      filename,
      path,
      added,
      removed,
    })
  }

  // Sort by most changes first
  fileChanges.sort((a, b) => (b.added + b.removed) - (a.added + a.removed))

  return {
    filesChanged: entries.length,
    totalLinesAdded,
    totalLinesRemoved,
    fileChanges,
  }
}

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
          // AI proposed a file change — add to pendingDiffs for user review
          // DO NOT apply or save until user explicitly accepts
          const { addPendingDiff } = useDiffStore.getState()
          
          // Add to pending diffs for review UI only
          addPendingDiff(msg.path, msg.original, msg.modified)
          
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
        // If any diffs arrived during this turn, mark agent as done so UI shows review panel
        const diffs = useDiffStore.getState().pendingDiffs
        if (Object.keys(diffs).length > 0) {
          const summary = generateSummary(diffs)
          useDiffStore.getState().setSummary(summary)
          useDiffStore.getState().setAgentDone()
        }
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
      // Reset any previous done-state so the banner hides while agent works
      useDiffStore.getState().resetAgentDone()

      // Read the active provider from settingsStore at send-time
      const provider = useSettingsStore.getState().provider || "groq"

      const payload = {
          message:         text,
          model:           model,
          provider:        provider,
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