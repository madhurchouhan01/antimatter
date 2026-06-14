import { create } from "zustand"

/**
 * Stores live agent activity for the current run.
 * Each "run" is one user message → agent response cycle.
 *
 * A trace entry shape:
 * {
 *   id:        string          – unique ID
 *   tool:      string          – tool name e.g. "read_file"
 *   status:    "running" | "done" | "error"
 *   input:     object          – tool input args
 *   output:    string | null   – tool output (arrives on tool_end)
 *   startedAt: number          – Date.now() when tool_start arrived
 *   durationMs: number | null  – set on tool_end
 * }
 */
export const useAgentTraceStore = create((set, get) => ({
  // All tool calls for the *current* run, in order
  entries: [],

  // Whether any run is currently active (controls the live indicator)
  isActive: false,

  // Whether the panel is open (user can collapse it)
  panelOpen: true,

  // Start a new run — clear previous entries
  startRun: () => set({ entries: [], isActive: true }),

  // Tool call started
  pushToolStart: (tool, input) =>
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id:         crypto.randomUUID(),
          tool,
          status:     "running",
          input:      input || {},
          output:     null,
          startedAt:  Date.now(),
          durationMs: null,
        },
      ],
    })),

  // Tool call finished — find the last "running" entry for this tool, mark done
  pushToolEnd: (tool, output) =>
    set((state) => {
      const entries = [...state.entries]
      // Walk backwards to find the most recent "running" entry for this tool
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].tool === tool && entries[i].status === "running") {
          entries[i] = {
            ...entries[i],
            status:     output?.startsWith?.("ERROR") ? "error" : "done",
            output,
            durationMs: Date.now() - entries[i].startedAt,
          }
          break
        }
      }
      return { entries }
    }),

  // Agent run finished
  endRun: () => set({ isActive: false }),

  // User collapses / expands the panel
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  // Clear everything (new chat)
  clear: () => set({ entries: [], isActive: false }),
}))
