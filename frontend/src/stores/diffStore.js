import { create } from "zustand"

/**
 * Holds any pending AI-proposed file diff waiting for user Accept/Reject.
 * Only one diff is shown at a time.
 */
export const useDiffStore = create((set) => ({
  /** @type {{ path: string, original: string, modified: string } | null} */
  pendingDiff: null,

  setPendingDiff: (diff) => set({ pendingDiff: diff }),
  clearPendingDiff: () => set({ pendingDiff: null }),
}))
