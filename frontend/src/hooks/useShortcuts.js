/**
 * useShortcuts.js
 *
 * Global keyboard shortcut handler for AntiMatter IDE.
 * All shortcuts use Ctrl (Windows/Linux) — no Cmd key mapping needed.
 *
 * Shortcut map:
 *   Ctrl+B              — Toggle sidebar
 *   Ctrl+J              — Toggle terminal
 *   Ctrl+\              — Toggle AI chat panel
 *   Ctrl+`              — Focus / new terminal
 *   Ctrl+Shift+`        — New terminal tab
 *   Ctrl+W              — Close active editor tab
 *   Ctrl+Tab            — Cycle to next editor tab
 *   Ctrl+Shift+Tab      — Cycle to previous editor tab
 *   Ctrl+S              — Save active file
 *   Ctrl+Shift+E        — Switch sidebar to Files tab
 *   Ctrl+Shift+G        — Switch sidebar to Git tab
 *   Ctrl+Shift+A        — Accept all pending diffs
 *   Ctrl+Shift+R        — Reject all pending diffs
 *   Ctrl+Shift+N        — New chat
 *   Ctrl+Shift+F        — Toggle terminal fullscreen
 *   Ctrl+Shift+H        — Open shortcuts help overlay
 *   Escape              — Close shortcuts overlay
 */

import { useEffect, useCallback } from "react"
import { useEditorStore }  from "../stores/editorStore"
import { useTerminalStore } from "../stores/terminalStore"
import { useDiffStore }    from "../stores/diffStore"
import { useChatStore }    from "../stores/chatStore"
import { useProjectStore } from "../stores/projectStore"
import { filesApi }        from "../lib/api"

/**
 * @param {object} handlers — functions provided by Layout
 *   toggleSidebar, toggleChat, toggleTerminal,
 *   setSidebarTab, openShortcutsHelp
 */
export function useShortcuts({
  toggleSidebar,
  toggleChat,
  toggleTerminal,
  setSidebarTab,
  openShortcutsHelp,
  closeShortcutsHelp,
}) {
  const project = useProjectStore((s) => s.activeProject)

  const handleKeyDown = useCallback(
    async (e) => {
      const ctrl  = e.ctrlKey
      const shift = e.shiftKey
      const key   = e.key

      // ── Escape: close help overlay ───────────────────────────────────
      if (key === "Escape") {
        closeShortcutsHelp?.()
        return
      }

      if (!ctrl) return

      switch (true) {

        // ── Ctrl+B: Toggle sidebar ───────────────────────────────────
        case key === "b" && !shift: {
          e.preventDefault()
          toggleSidebar()
          break
        }

        // ── Ctrl+J: Toggle terminal ──────────────────────────────────
        case key === "j" && !shift: {
          e.preventDefault()
          toggleTerminal()
          break
        }

        // ── Ctrl+\: Toggle AI chat ───────────────────────────────────
        case key === "\\" && !shift: {
          e.preventDefault()
          toggleChat()
          break
        }

        // ── Ctrl+`: Focus terminal (open if closed) ──────────────────
        case key === "`" && !shift: {
          e.preventDefault()
          const { termOpen, setTermOpen } = useTerminalStore.getState()
          if (!termOpen) setTermOpen(true)
          // Brief delay so the terminal DOM mounts before focus
          setTimeout(() => {
            document.querySelector(".xterm-helper-textarea")?.focus()
          }, 80)
          break
        }

        // ── Ctrl+Shift+`: New terminal tab ───────────────────────────
        case key === "`" && shift: {
          e.preventDefault()
          const { sessions, addSession } = useTerminalStore.getState()
          const { termOpen, setTermOpen } = useTerminalStore.getState()
          if (!termOpen) setTermOpen(true)
          addSession({ id: `term-${Date.now()}`, name: `bash ${sessions.length + 1}` })
          break
        }

        // ── Ctrl+W: Close active editor tab ─────────────────────────
        case key === "w" && !shift: {
          // Only intercept if not inside a Monaco editor input (Monaco handles Ctrl+W itself)
          if (document.activeElement?.classList.contains("inputarea")) break
          e.preventDefault()
          const { activeFile, closeFile } = useEditorStore.getState()
          if (activeFile) closeFile(activeFile)
          break
        }

        // ── Ctrl+Tab: Next editor tab ────────────────────────────────
        case key === "Tab" && !shift: {
          if (!document.activeElement?.classList.contains("inputarea")) {
            e.preventDefault()
            const { openFiles, activeFile, openFile } = useEditorStore.getState()
            if (openFiles.length < 2) break
            const idx = openFiles.findIndex((f) => f.path === activeFile)
            const next = openFiles[(idx + 1) % openFiles.length]
            openFile(next.path, next.content)
          }
          break
        }

        // ── Ctrl+Shift+Tab: Previous editor tab ─────────────────────
        case key === "Tab" && shift: {
          if (!document.activeElement?.classList.contains("inputarea")) {
            e.preventDefault()
            const { openFiles, activeFile, openFile } = useEditorStore.getState()
            if (openFiles.length < 2) break
            const idx = openFiles.findIndex((f) => f.path === activeFile)
            const prev = openFiles[(idx - 1 + openFiles.length) % openFiles.length]
            openFile(prev.path, prev.content)
          }
          break
        }

        // ── Ctrl+S: Save active file ─────────────────────────────────
        case key === "s" && !shift: {
          e.preventDefault()
          if (!project) break
          const { openFiles, activeFile, markSaved } = useEditorStore.getState()
          const file = openFiles.find((f) => f.path === activeFile)
          if (file?.isDirty) {
            try {
              await filesApi.write(project.id, file.path, file.content)
              markSaved(file.path)
            } catch (err) {
              console.error("Save failed:", err)
            }
          }
          break
        }

        // ── Ctrl+Shift+E: Sidebar → Files ────────────────────────────
        case key === "E" && shift: {
          e.preventDefault()
          setSidebarTab("files")
          break
        }

        // ── Ctrl+Shift+G: Sidebar → Git ──────────────────────────────
        case key === "G" && shift: {
          e.preventDefault()
          setSidebarTab("git")
          break
        }

        // ── Ctrl+Shift+A: Accept all diffs ───────────────────────────
        case key === "A" && shift: {
          e.preventDefault()
          if (!project) break
          const { pendingDiffs, agentDone, clearAll } = useDiffStore.getState()
          if (!agentDone) break
          const { updateContent, markSaved } = useEditorStore.getState()
          for (const [path, diff] of Object.entries(pendingDiffs)) {
            try {
              await filesApi.write(project.id, path, diff.modified)
              updateContent(path, diff.modified)
              markSaved(path)
            } catch {}
          }
          clearAll()
          break
        }

        // ── Ctrl+Shift+R: Reject all diffs ───────────────────────────
        case key === "R" && shift: {
          e.preventDefault()
          const { agentDone, clearAll } = useDiffStore.getState()
          if (agentDone) clearAll()
          break
        }

        // ── Ctrl+Shift+N: New chat ───────────────────────────────────
        case key === "N" && shift: {
          e.preventDefault()
          useChatStore.getState().clearChat()
          break
        }

        // ── Ctrl+Shift+F: Toggle terminal fullscreen ─────────────────
        case key === "F" && shift: {
          e.preventDefault()
          const { termFullscreen, setTermFullscreen } = useTerminalStore.getState()
          setTermFullscreen(!termFullscreen)
          break
        }
        
        // ── Ctrl+Shift+H: Open shortcuts help ──────────────────────────────
        case key === "H" && shift: {
          e.preventDefault()
          openShortcutsHelp?.()
          break
        }

        default:
          break
      }
    },
    [toggleSidebar, toggleChat, toggleTerminal, setSidebarTab,
     openShortcutsHelp, closeShortcutsHelp, project]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}

/** Master shortcut reference — used by ShortcutsOverlay */
export const SHORTCUTS = [
  {
    group: "Panels",
    items: [
      { keys: ["Ctrl", "B"],           label: "Toggle sidebar" },
      { keys: ["Ctrl", "J"],           label: "Toggle terminal" },
      { keys: ["Ctrl", "\\"],          label: "Toggle AI chat panel" },
      { keys: ["Ctrl", "Shift", "F"],  label: "Terminal fullscreen" },
    ],
  },
  {
    group: "Editor Tabs",
    items: [
      { keys: ["Ctrl", "W"],           label: "Close active tab" },
      { keys: ["Ctrl", "Tab"],         label: "Next tab" },
      { keys: ["Ctrl", "Shift", "Tab"],label: "Previous tab" },
      { keys: ["Ctrl", "S"],           label: "Save file" },
    ],
  },
  {
    group: "Terminal",
    items: [
      { keys: ["Ctrl", "`"],           label: "Focus / open terminal" },
      { keys: ["Ctrl", "Shift", "`"],  label: "New terminal tab" },
    ],
  },
  {
    group: "Sidebar",
    items: [
      { keys: ["Ctrl", "Shift", "E"],  label: "Switch to Files tab" },
      { keys: ["Ctrl", "Shift", "G"],  label: "Switch to Git tab" },
    ],
  },
  {
    group: "AI & Diffs",
    items: [
      { keys: ["Ctrl", "Shift", "N"],  label: "New chat" },
      { keys: ["Ctrl", "Shift", "A"],  label: "Accept all pending diffs" },
      { keys: ["Ctrl", "Shift", "R"],  label: "Reject all pending diffs" },
    ],
  },
  {
    group: "Help",
    items: [
      { keys: ["Ctrl", "Shift", "H"],  label: "Show shortcuts" },
      { keys: ["Escape"],              label: "Close overlay" },
    ],
  },
]
