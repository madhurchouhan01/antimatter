import { create } from "zustand"

export const useTerminalStore = create((set) => ({
  sessions: [],       // [{ id, projectId }]
  activeSession: null,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSession: session.id,
    })),

  setActiveSession: (id) => set({ activeSession: id }),

  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSession:
        state.activeSession === id
          ? state.sessions[0]?.id ?? null
          : state.activeSession,
    })),
}))