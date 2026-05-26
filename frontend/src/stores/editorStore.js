import { create } from "zustand"

export const useEditorStore = create((set, get) => ({
  // Open tabs
  openFiles: [],      // [{ path, content, isDirty }]
  activeFile: null,   // path string

  openFile: (path, content) => {
    const { openFiles } = get()
    const already = openFiles.find((f) => f.path === path)
    if (!already) {
      set({ openFiles: [...openFiles, { path, content, isDirty: false }] })
    }
    set({ activeFile: path })
  },

  updateContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, isDirty: true } : f
      ),
    })),

  markSaved: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, isDirty: false } : f
      ),
    })),

  closeFile: (path) =>
    set((state) => {
      const remaining = state.openFiles.filter((f) => f.path !== path)
      return {
        openFiles: remaining,
        activeFile:
          state.activeFile === path
            ? remaining[remaining.length - 1]?.path ?? null
            : state.activeFile,
      }
    }),
}))