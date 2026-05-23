import { create } from "zustand"

export const useChatStore = create((set, get) => ({
  messages:       [],   // [{ id, role, content, toolCalls }]
  conversationId: null,
  isStreaming:    false,
  streamBuffer:   "",

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  setStreaming: (val) => set({ isStreaming: val }),

  appendToken: (token) =>
    set((state) => ({ streamBuffer: state.streamBuffer + token })),

  flushBuffer: () =>
    set((state) => {
      if (!state.streamBuffer) return {}
      const msg = {
        id:      crypto.randomUUID(),
        role:    "assistant",
        content: state.streamBuffer,
      }
      return {
        messages:    [...state.messages, msg],
        streamBuffer: "",
        isStreaming:  false,
      }
    }),

  setConversationId: (id) => set({ conversationId: id }),
  clearChat: () => set({ messages: [], conversationId: null, streamBuffer: "" }),
}))