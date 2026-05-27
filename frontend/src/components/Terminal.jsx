import { useEffect, useRef } from "react"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { useAuthStore } from "../stores/authStore"
import { useProjectStore } from "../stores/projectStore"
import { useTerminalStore } from "../stores/terminalStore"
import "@xterm/xterm/css/xterm.css"

export default function Terminal() {
  const termRef    = useRef(null)   // DOM container
  const xtermRef   = useRef(null)   // XTerm instance
  const fitRef     = useRef(null)   // FitAddon instance
  const wsRef      = useRef(null)   // WebSocket
  const token      = useAuthStore((s) => s.token)
  const project    = useProjectStore((s) => s.activeProject)

  useEffect(() => {
    if (!termRef.current || !project) return

    // Init XTerm
    const term = new XTerm({
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor:     "#cccccc",
        black:      "#000000",
        brightBlack:"#666666",
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

    // Connect WebSocket
    const ws = new WebSocket(
      `ws://127.0.0.1:1842/api/terminal/ws/${project.id}?token=${token}`
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

      useTerminalStore.setState({ sendCommand: sendCmdFn })

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
      useTerminalStore.setState({ sendCommand: null })
    }
  }, [project, token])

  return (
    <div
      ref={termRef}
      className="h-full w-full bg-editor-bg p-1"
      style={{ minHeight: 0 }}
    />
  )
}