import { create } from "zustand"

export const useDiffStore = create((set) => ({
  /** @type {Object.<string, { original: string, modified: string }>} */
  pendingDiffs: {},
  
  /** True once the agent finishes its turn — triggers the review UI */
  agentDone: false,
  
  /** Which file is currently being reviewed inline in the editor */
  reviewingFile: null,

  addPendingDiff: (path, original, modified) => set(state => ({
    pendingDiffs: {
      ...state.pendingDiffs,
      [path]: { original, modified }
    }
  })),

  removePendingDiff: (path) => set(state => {
    const next = { ...state.pendingDiffs }
    delete next[path]
    return { pendingDiffs: next, reviewingFile: state.reviewingFile === path ? null : state.reviewingFile }
  }),

  clearAll: () => set({ pendingDiffs: {}, reviewingFile: null, agentDone: false }),

  setAgentDone: () => set({ agentDone: true }),
  resetAgentDone: () => set({ agentDone: false }),

  setReviewingFile: (path) => set({ reviewingFile: path }),
}))

