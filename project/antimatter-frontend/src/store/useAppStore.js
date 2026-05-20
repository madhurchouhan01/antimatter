// src/store/useAppStore.js
import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  backendUrl: 'http://localhost:1842',
  files: {},
  openTabs: [],
  activeFile: null,
  currentMode: 'forge',
  terminalOpen: true,
  currentUser: null,
  sandboxSessionId: null, // Keep track of the active shell container instance
  sidebarWidth: 220,
  aiPanelWidth: 320,
  terminalHeight: 250,
  sendTerminalCommand: null,

  setFiles: (files) => set({ files }),
  setSandboxSessionId: (id) => set({ sandboxSessionId: id }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setAiPanelWidth: (w) => set({ aiPanelWidth: w }),
  setTerminalHeight: (h) => set({ terminalHeight: h }),
  setSendTerminalCommand: (fn) => set({ sendTerminalCommand: fn }),

  openFile: (name) => set((state) => {
    const tabs = state.openTabs.includes(name) ? state.openTabs : [...state.openTabs, name];
    return { activeFile: name, openTabs: tabs };
  }),

  closeTab: (name) => set((state) => {
    const openTabs = state.openTabs.filter((t) => t !== name);
    let activeFile = state.activeFile;
    if (activeFile === name) {
      activeFile = openTabs.length > 0 ? openTabs[openTabs.length - 1] : null;
    }
    return { openTabs, activeFile };
  }),

  updateFileContent: (name, content) => set((state) => ({
    files: { ...state.files, [name]: content }
  })),

  // Save the currently active editor file back down to the backend runtime layer
  saveCurrentFileToDisk: async () => {
    const { activeFile, files, backendUrl, sandboxSessionId } = get();
    if (!activeFile || !sandboxSessionId) return;

    try {
      await fetch(`${backendUrl}/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sandboxSessionId,
          path: activeFile,
          content: files[activeFile] || ''
        })
      });
      console.log(`Saved successfully to workspace sandbox: ${activeFile}`);
    } catch (err) {
      console.error('Failed to sync file content down to workspace disk:', err);
    }
  },

  setMode: (currentMode) => set({ currentMode }),
  toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
  setTerminalOpen: (isOpen) => set({ terminalOpen: isOpen }),
  setCurrentUser: (currentUser) => set({ currentUser }),
}));