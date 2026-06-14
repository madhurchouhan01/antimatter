import { create } from "zustand"
import { persist } from "zustand/middleware"

export const useChatStore = create(
  persist(
    (set) => ({
      messages:       [],
      conversationId: null,
      isStreaming:    false,
      streamBuffer:   "",
      isConnected:    false,

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
      clearChat: () => set({ messages: [], conversationId: null, streamBuffer: "", isConnected: false }),
    }),
    {
      name: "chat-storage",
      partialize: (state) => ({
        messages: state.messages,
        conversationId: state.conversationId
      }),
    }
  )
)
