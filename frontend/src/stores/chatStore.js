import { create } from "zustand"
import { persist } from "zustand/middleware"
import { conversationsApi } from "../lib/api"

function reconstructMessages(dbMessages) {
  const reconstructed = []
  let activeEntries = []

  for (const msg of dbMessages) {
    if (msg.role === "user") {
      if (activeEntries.length > 0) {
        reconstructed.push({
          id: crypto.randomUUID(),
          role: "activity",
          entries: [...activeEntries],
        })
        activeEntries = []
      }
      reconstructed.push({
        id: msg.id,
        role: "user",
        content: msg.content,
      })
    } else if (msg.role === "assistant" && msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        activeEntries.push({
          id: tc.id,
          tool: tc.name,
          status: "done",
          input: tc.args || {},
          output: null,
          startedAt: Date.parse(msg.created_at) || Date.now(),
          durationMs: null,
        })
      }
    } else if (msg.role === "tool") {
      const toolCallId = msg.tool_calls?.id
      const toolName = msg.tool_calls?.name
      let found = false
      if (toolCallId) {
        const entry = activeEntries.find((e) => e.id === toolCallId)
        if (entry) {
          entry.output = msg.content
          entry.status = msg.content?.startsWith?.("ERROR") ? "error" : "done"
          found = true
        }
      }
      if (!found && toolName) {
        const entry = activeEntries.find((e) => e.tool === toolName && !e.output)
        if (entry) {
          entry.output = msg.content
          entry.status = msg.content?.startsWith?.("ERROR") ? "error" : "done"
        }
      }
    } else if (msg.role === "assistant") {
      if (activeEntries.length > 0) {
        reconstructed.push({
          id: crypto.randomUUID(),
          role: "activity",
          entries: [...activeEntries],
        })
        activeEntries = []
      }
      reconstructed.push({
        id: msg.id,
        role: "assistant",
        content: msg.content,
      })
    } else {
      reconstructed.push({
        id: msg.id,
        role: msg.role,
        content: msg.content,
      })
    }
  }

  if (activeEntries.length > 0) {
    reconstructed.push({
      id: crypto.randomUUID(),
      role: "activity",
      entries: [...activeEntries],
    })
  }

  return reconstructed
}

export const useChatStore = create(
  persist(
    (set, get) => ({
      messages:       [],
      conversationId: null,
      conversations:  [],
      isStreaming:    false,
      streamBuffer:   "",
      isConnected:    false,
      input:          "",
      inputPulse:     false,

      setInput: (val) => set({ input: val }),
      setInputPulse: (val) => set({ inputPulse: val }),

      addMessage: (msg) =>
        set((state) => ({ messages: [...state.messages, msg] })),

      setStreaming: (val) => set({ isStreaming: val }),
      setConnected: (val) => set({ isConnected: val }),

      appendToken: (token) =>
        set((state) => ({ streamBuffer: state.streamBuffer + token })),

      flushBuffer: (finalText) =>
        set((state) => {
          const content = (finalText !== undefined && finalText !== null) ? finalText : state.streamBuffer;
          if (!content) return { isStreaming: false }
          const msg = {
            id:      crypto.randomUUID(),
            role:    "assistant",
            content: content,
          }
          return {
            messages:    [...state.messages, msg],
            streamBuffer: "",
            isStreaming:  false,
          }
        }),

      setConversationId: (id) => set({ conversationId: id }),
      clearChat: () => set({ messages: [], conversationId: null, streamBuffer: "", isConnected: false, input: "" }),

      fetchConversations: async (projectId) => {
        if (!projectId) return
        try {
          const res = await conversationsApi.list(projectId)
          set({ conversations: res.data })
        } catch (err) {
          console.error("Failed to fetch conversations:", err)
        }
      },

      loadConversation: async (projectId, convId) => {
        if (!projectId || !convId) return
        try {
          const res = await conversationsApi.messages(projectId, convId)
          const reconstructed = reconstructMessages(res.data)
          set({ messages: reconstructed, conversationId: convId })
        } catch (err) {
          console.error("Failed to load conversation:", err)
        }
      },

      deleteConversation: async (projectId, convId) => {
        if (!projectId || !convId) return
        try {
          await conversationsApi.delete(projectId, convId)
          if (get().conversationId === convId) {
            get().clearChat()
          }
          await get().fetchConversations(projectId)
        } catch (err) {
          console.error("Failed to delete conversation:", err)
        }
      },

      renameConversation: async (projectId, convId, newTitle) => {
        if (!projectId || !convId) return
        try {
          await conversationsApi.update(projectId, convId, newTitle)
          await get().fetchConversations(projectId)
        } catch (err) {
          console.error("Failed to rename conversation:", err)
        }
      },
    }),
    {
      name: "chat-storage",
      partialize: (state) => ({
        conversationId: state.conversationId
      }),
    }
  )
)
