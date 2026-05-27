import { create } from "zustand"

export const useFileTreeStore = create((set) => ({
    dirtyPaths: [],    // paths that need refresh
    indexing:   false, // true while initial index runs
    syncing:    false, // true while syncing file changes
    debounceTimer: null,

    markDirty: (path, event) => {
        set((state) => {
            // Clear existing debounce timer
            if (state.debounceTimer) {
                clearTimeout(state.debounceTimer)
            }

            // Add to dirty paths
            const newDirtyPaths = [...state.dirtyPaths, { path, event, ts: Date.now() }]
            
            // Set up new debounce timer (300ms to match backend)
            const timer = setTimeout(() => {
                set({ syncing: false })
            }, 300)

            return {
                dirtyPaths: newDirtyPaths,
                syncing: true,
                debounceTimer: timer,
            }
        })
    },

    clearDirty: () => set({ dirtyPaths: [], syncing: false }),
    setIndexing: (val) => set({ indexing: val }),
    setSyncing: (val) => set({ syncing: val }),
}))