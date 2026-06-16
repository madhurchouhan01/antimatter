import { useEffect, useRef } from "react"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { useAuthStore } from "../stores/authStore"
import { useProjectStore } from "../stores/projectStore"
import { useTerminalStore, registerTerminalInstance, unregisterTerminalInstance } from "../stores/terminalStore"
import "@xterm/xterm/css/xterm.css"

export default function Terminal({ terminalId }) {
  const termRef    = useRef(null)   // DOM container
  const xtermRef   = useRef(null)   // XTerm instance
  const fitRef     = useRef(null)   // FitAddon instance
  const wsRef      = useRef(null)   // WebSocket
  const token      = useAuthStore((s) => s.token)
  const project    = useProjectStore((s) => s.activeProject)
  const activeSession = useTerminalStore((s) => s.activeSession)

  // Active terminal tab sendCommand synchronization
  useEffect(() => {
    if (terminalId === activeSession && wsRef.current?.readyState === WebSocket.OPEN) {
      const ws = wsRef.current
      const sendCmdFn = (cmd) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(cmd))
        }
      }
      useTerminalStore.setState({ sendCommand: sendCmdFn })
    }
  }, [terminalId, activeSession, wsRef.current])

  useEffect(() => {
    if (!termRef.current || !project || !terminalId) return

    // Init XTerm with Tokyo Night ultra-aesthetic terminal colors
    const term = new XTerm({
      theme: {
        background: "#12131a", // Deep dark blue-black
        foreground: "#a9b1d6", // Tokyo night icy gray-white
        cursor:     "#f7768e", // Tokyo night hot pink/red
        cursorAccent: "#12131a",
        selectionBackground: "rgba(255, 255, 255, 0.15)",
        // ANSI Colors
        black:      "#1d202f",
        red:        "#f7768e",
        green:      "#9ece6a",
        yellow:     "#e0af68",
        blue:       "#7aa2f7",
        magenta:    "#bb9af7",
        cyan:       "#7dcfff",
        white:      "#a9b1d6",
        brightBlack:   "#414868",
        brightRed:     "#f7768e",
        brightGreen:   "#9ece6a",
        brightYellow:  "#e0af68",
        brightBlue:    "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan:    "#7dcfff",
        brightWhite:   "#c0caf5",
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 14,
      cursorBlink: true,
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(termRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitRef.current   = fitAddon
    registerTerminalInstance(terminalId, term)

    // Connect WebSocket passing terminal_id parameter
    const ws = new WebSocket(
      `ws://127.0.0.1:1842/api/terminal/ws/${project.id}?token=${token}&terminal_id=${terminalId}`
    )
    ws.binaryType = "arraybuffer"
    wsRef.current = ws

    ws.onopen = () => {
      term.writeln("\r\n\x1b[32mTerminal connected.\x1b[0m\r\n")
      
      const sendCmdFn = (cmd) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(cmd))
        }
      }

      // If this terminal is currently active, register its sendCommand handler
      const currentActive = useTerminalStore.getState().activeSession
      if (terminalId === currentActive) {
        useTerminalStore.setState({ sendCommand: sendCmdFn })
      }

      // Flush pending commands
      const { pendingCommands, clearPendingCommands } = useTerminalStore.getState()
      if (pendingCommands.length > 0) {
        pendingCommands.forEach((cmd) => {
          sendCmdFn(cmd)
        })
        clearPendingCommands()
      }
    }

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data))
      }
    }

    ws.onclose = () => term.writeln("\r\n\x1b[31mDisconnected.\x1b[0m")
    ws.onerror = () => term.writeln("\r\n\x1b[31mConnection error.\x1b[0m")

    // Keystrokes → WebSocket (binary)
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data))
      }
    })

    // Resize → send JSON control message
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (ws.readyState === WebSocket.OPEN && term.cols && term.rows) {
          ws.send(JSON.stringify({
            type: "resize",
            cols: term.cols,
            rows: term.rows,
          }))
        }
      } catch (err) {
        console.debug("Fit error ignored", err)
      }
    })
    resizeObserver.observe(termRef.current)

    return () => {
      resizeObserver.disconnect()
      term.dispose()
      ws.close()
      unregisterTerminalInstance(terminalId)
      // If we are unmounting, clear sendCommand
      useTerminalStore.setState({ sendCommand: null })
    }
  }, [project, token, terminalId])

  return (
    <div
      ref={termRef}
      className="h-full w-full bg-[#12131a] p-1"
      style={{ minHeight: 0 }}
    />
  )
}