import { create } from "zustand"

export const useFileTreeStore = create((set) => ({
    dirtyPaths: [],    // paths that need refresh
    indexing:   false, // true while initial index runs

    markDirty: (path, event) => {
        set((state) => ({
            dirtyPaths: [...state.dirtyPaths, { path, event, ts: Date.now() }]
        }))
    },

    clearDirty: () => set({ dirtyPaths: [] }),
    setIndexing: (val) => set({ indexing: val }),
}))