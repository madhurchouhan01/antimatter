import { useCallback } from "react"
import { useChatStore } from "../stores/chatStore"
import { useAuthStore } from "../stores/authStore"
import { useEditorStore } from "../stores/editorStore"
import { useFileTreeStore } from "../stores/fileTreeStore"
import { useDiffStore } from "../stores/diffStore"
import { useSettingsStore } from "../stores/settingsStore"
import { useAgentTraceStore } from "../stores/agentTraceStore"
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
          setStreaming, setConversationId, setConnected } = useChatStore()
  const token = useAuthStore((s) => s.token)

  const connect = useCallback(() => {
    if (!projectId) return                                        // no project yet
    if (globalWs?.readyState === WebSocket.OPEN) return
    if (globalWs?.readyState === WebSocket.CONNECTING) return

    const url = `ws://127.0.0.1:1842/api/agent/ws/${projectId}?token=${token}`
    const ws  = new WebSocket(url)
    globalWs = ws

    ws.onopen = () => {
      setConnected(true)
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
      if (msg.type === "route") {
          useChatStore.getState().setCurrentRoute(msg.route)
          return
      }
      if (msg.type === "token") {
        setStreaming(true)
        appendToken(msg.content)
      } else if (msg.type === "tool_start") {
        // Feed trace store
        useAgentTraceStore.getState().pushToolStart(msg.tool, msg.input)
      } else if (msg.type === "tool_end") {
        // Feed trace store
        useAgentTraceStore.getState().pushToolEnd(msg.tool, msg.output)
      } else if (msg.type === "done") {
        const finalEntries = useAgentTraceStore.getState().entries
        if (finalEntries.length > 0) {
          addMessage({
            id:      crypto.randomUUID(),
            role:    "activity",
            entries: finalEntries,
          })
        }
        flushBuffer(msg.final_text, msg.token_usage || null)
        setConversationId(msg.conversation_id)
        
        // Refresh conversations list to update sidebar titles
        useChatStore.getState().fetchConversations(projectId)

        // Mark trace run as finished
        useAgentTraceStore.getState().endRun()
        // If any diffs arrived during this turn, mark agent as done so UI shows review panel
        const diffs = useDiffStore.getState().pendingDiffs
        if (Object.keys(diffs).length > 0) {
          const summary = generateSummary(diffs)
          useDiffStore.getState().setSummary(summary)
          useDiffStore.getState().setAgentDone()
        }
      } else if (msg.type === "error") {
        setStreaming(false)
        useAgentTraceStore.getState().endRun()
        addMessage({ id: crypto.randomUUID(), role: "error", content: msg.message, error_type: msg.error_type })
      }
    }

    ws.onerror = (e) => {
      console.error("Agent socket error:", e)
      setConnected(false)
      setStreaming(false)
      useAgentTraceStore.getState().endRun()
    }

    ws.onclose = () => {
      setConnected(false)
      setStreaming(false)
      useAgentTraceStore.getState().endRun()
      if (globalWs === ws) {
        globalWs = null
      }
      // Auto-reconnect after 5 seconds
      if (projectId) {
        setTimeout(() => {
          connect()
        }, 5000)
      }
    }
  }, [projectId, token, addMessage, appendToken, flushBuffer, setConversationId, setStreaming, setConnected])

  const sendMessage = useCallback((text, model = "llama-3.3-70b-versatile", options = {}) => {
      const { conversationId } = useChatStore.getState()
      const openFiles = useEditorStore.getState().openFiles.map((f) => f.path)

      if (!options.hidden) {
        addMessage({ id: crypto.randomUUID(), role: options.role || "user", content: text })
      }
      // Start a fresh trace run for this message
      useAgentTraceStore.getState().startRun()
      // Reset any previous done-state so the banner hides while agent works
      useDiffStore.getState().resetAgentDone()
      // Reset current route for the new stream
      useChatStore.getState().setCurrentRoute(null)

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
    setConnected(false)
  }, [setConnected])

  return { sendMessage, connect, disconnect }
}