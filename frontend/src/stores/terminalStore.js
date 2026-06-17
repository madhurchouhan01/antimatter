import { create } from "zustand"

export const useTerminalStore = create((set) => ({
  sessions: [{ id: "default", name: "bash 1" }],       // Start with one default terminal tab
  activeSession: "default",
  termOpen: true,
  termFullscreen: false,
  setTermFullscreen: (val) => set({ termFullscreen: val }),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSession: session.id,
    })),

  setActiveSession: (id) => set({ activeSession: id }),

  removeSession: (id) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id)
      // Ensure we always have at least one active terminal tab
      const finalSessions = remaining.length > 0 ? remaining : [{ id: `term-${Date.now()}`, name: "bash 1" }]
      const nextActive = state.activeSession === id
        ? finalSessions[0]?.id
        : state.activeSession

      return {
        sessions: finalSessions,
        activeSession: nextActive,
      }
    }),

  setTermOpen: (val) => set({ termOpen: val }),
  sendCommand: null,
  pendingCommands: [],
  addPendingCommand: (cmd) => set((state) => ({ pendingCommands: [...state.pendingCommands, cmd] })),
  clearPendingCommands: () => set({ pendingCommands: [] }),
}))

const terminalInstances = {}

export const registerTerminalInstance = (id, term) => {
  terminalInstances[id] = term
}

export const unregisterTerminalInstance = (id) => {
  delete terminalInstances[id]
}

export const getTerminalBufferText = (id) => {
  const term = terminalInstances[id]
  if (!term) return ""
  const buffer = term.buffer.active
  const lines = []
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i)
    if (line) {
      lines.push(line.translateToString(true))
    }
  }
  
  // Trim trailing empty lines
  let end = lines.length - 1
  while (end >= 0 && (!lines[end] || lines[end].trim() === "")) {
    end--
  }
  return lines.slice(0, end + 1).join("\n")
}