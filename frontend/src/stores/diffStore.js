import { create } from "zustand"

export const useDiffStore = create((set) => ({
  /** @type {Object.<string, { original: string, modified: string, accepted: boolean }>} */
  pendingDiffs: {},
  
  /** True once the agent finishes its turn — triggers the review UI */
  agentDone: false,
  
  /** Which file is currently being reviewed inline in the editor */
  reviewingFile: null,

  /** Summary of all changes */
  summary: null,

  addPendingDiff: (path, original, modified) => set(state => ({
    pendingDiffs: {
      ...state.pendingDiffs,
      [path]: { original, modified, accepted: false }
    }
  })),

  removePendingDiff: (path) => set(state => {
    const next = { ...state.pendingDiffs }
    delete next[path]
    return { pendingDiffs: next, reviewingFile: state.reviewingFile === path ? null : state.reviewingFile }
  }),

  acceptPendingDiff: (path) => set(state => ({
    pendingDiffs: {
      ...state.pendingDiffs,
      [path]: { ...state.pendingDiffs[path], accepted: true }
    }
  })),

  clearAll: () => set({ pendingDiffs: {}, reviewingFile: null, agentDone: false, summary: null }),

  setAgentDone: () => set({ agentDone: true }),
  resetAgentDone: () => set({ agentDone: false }),

  setReviewingFile: (path) => set({ reviewingFile: path }),

  setSummary: (summary) => set({ summary }),
}))

