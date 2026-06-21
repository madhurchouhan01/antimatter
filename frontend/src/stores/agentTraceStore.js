import { create } from "zustand"

/**
 * Stores live agent activity for the current run.
 *
 * Entry types:
 *  - "lifecycle"  → { kind: "classify"|"context"|"llm_call"|"finalize"|"cmd_running", label, meta }
 *  - "tool"       → tool call (tool_start / tool_end)
 *  - "token_tick" → lightweight token usage snapshot attached to an llm_call step
 *
 * A trace entry shape:
 * {
 *   id:         string
 *   type:       "lifecycle" | "tool"
 *   // lifecycle only
 *   kind:       "classify"|"context"|"llm_call"|"finalize"|"cmd_running"
 *   label:      string
 *   meta:       object | null     – e.g. { route, tokens, model }
 *   status:     "running"|"done"
 *   // tool only
 *   tool:       string
 *   input:      object
 *   output:     string | null
 *   startedAt:  number
 *   durationMs: number | null
 * }
 */
export const useAgentTraceStore = create((set, get) => ({
  entries:  [],
  isActive: false,
  panelOpen: true,

  // ── Lifecycle control ────────────────────────────────────────────────────────

  startRun: () => set({ entries: [], isActive: true }),

  pushLifecycle: (kind, label, meta = null) =>
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id:        crypto.randomUUID(),
          type:      "lifecycle",
          kind,
          label,
          meta,
          status:    "running",
          startedAt: Date.now(),
          durationMs: null,
        },
      ],
    })),

  resolveLifecycle: (kind, meta = null) =>
    set((state) => {
      const entries = [...state.entries]
      // find last running lifecycle of this kind
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].type === "lifecycle" && entries[i].kind === kind && entries[i].status === "running") {
          entries[i] = {
            ...entries[i],
            status:     "done",
            durationMs: Date.now() - entries[i].startedAt,
            meta:       meta ?? entries[i].meta,
          }
          break
        }
      }
      return { entries }
    }),

  // ── Tool call tracking ────────────────────────────────────────────────────────

  pushToolStart: (tool, input) =>
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id:         crypto.randomUUID(),
          type:       "tool",
          tool,
          status:     "running",
          input:      input || {},
          output:     null,
          startedAt:  Date.now(),
          durationMs: null,
        },
      ],
    })),

  pushToolEnd: (tool, output) =>
    set((state) => {
      const entries = [...state.entries]
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].type === "tool" && entries[i].tool === tool && entries[i].status === "running") {
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

  // ── Session end ──────────────────────────────────────────────────────────────

  endRun:      () => set({ isActive: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  clear:       () => set({ entries: [], isActive: false }),
}))
