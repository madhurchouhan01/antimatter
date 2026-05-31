import { create } from "zustand"

export const useDiffStore = create((set) => ({
  /** @type {Object.<string, { original: string, modified: string }>} */
  pendingDiffs: {},

  addPendingDiff: (path, original, modified) => set(state => ({
    pendingDiffs: {
      ...state.pendingDiffs,
      [path]: { original, modified }
    }
  })),

  removePendingDiff: (path) => set(state => {
    const next = { ...state.pendingDiffs }
    delete next[path]
    return { pendingDiffs: next }
  }),

  clearAll: () => set({ pendingDiffs: {} }),
}))
