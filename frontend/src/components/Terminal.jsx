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
  const isFirstConnectRef = useRef(true)

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

    let ws = null
    let pingInterval = null
    let reconnectTimeout = null
    let isDisposed = false

    const connectSocket = () => {
      if (isDisposed) return

      // Connect WebSocket passing terminal_id parameter
      ws = new WebSocket(
        `ws://127.0.0.1:1842/api/terminal/ws/${project.id}?token=${token}&terminal_id=${terminalId}`
      )
      ws.binaryType = "arraybuffer"
      wsRef.current = ws

      ws.onopen = () => {
        const sendCmdFn = (cmd) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(new TextEncoder().encode(cmd))
          }
        }

        if (isFirstConnectRef.current) {
          // Set a premium, colorful prompt prefix (⚛ Antimatter /workspace ❯) and enable ls colors
          const initCmd = 'export PS1="\\[\\e[1;35m\\]⚡ Antimatter \\[\\e[1;36m\\]\\w \\[\\e[1;30m\\]❯ \\[\\e[0m\\]" && alias ls="ls --color=auto" && clear\n';
          sendCmdFn(initCmd);

          setTimeout(() => {
            if (isDisposed) return;
            term.write("\x1b[2J\x1b[H"); // Clear screen and home cursor
            term.writeln("\x1b[1;35m    ___          __  _ __  ___      __  __           \x1b[0m")
            term.writeln("\x1b[1;34m   /   |  ____  / /_(_)  |/  /___ _/ /_/ /____  _____\x1b[0m")
            term.writeln("\x1b[1;36m  / /| | / __ \\/ __/ / /|_/ / __ `/ __/ __/ _ \\/ ___/\x1b[0m")
            term.writeln("\x1b[1;34m / ___ |/ / / / /_/ / /  / / /_/ / /_/ /_/  __/ /    \x1b[0m")
            term.writeln("\x1b[1;35m/_/  |_/_/ /_/\\__/_/_/  /_/\\__,_/\\__/\\__/\\___/_/     \x1b[0m")
            term.writeln("")
            term.writeln("\x1b[90m  ── Isolated Developer Workspace Ready ──\x1b[0m")
            term.writeln("\x1b[32m  ✔ Connected to environment sandbox securely\x1b[0m")
            term.writeln("\x1b[36m  ⚡ Type commands below to execute them\x1b[0m\r\n")
          }, 120);
          isFirstConnectRef.current = false;
        } else {
          term.writeln("\r\n\x1b[1;32m✔ Reconnected to session.\x1b[0m\r\n")
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

        // Keep-alive heartbeat to prevent idle connection drop
        if (pingInterval) clearInterval(pingInterval)
        pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }))
          }
        }, 20000)
      }

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data))
        }
      }

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval)
        if (!isDisposed) {
          term.writeln("\r\n\x1b[1;33m⚠️ Connection lost. Retrying in 3s...\x1b[0m")
          reconnectTimeout = setTimeout(connectSocket, 3000)
        }
      }

      ws.onerror = () => {
        term.writeln("\r\n\x1b[1;31m❌ Connection error.\x1b[0m")
      }
    }

    connectSocket()

    // Keystrokes → WebSocket (binary)
    term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data))
      }
    })

    // Resize → send JSON control message
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (ws && ws.readyState === WebSocket.OPEN && term.cols && term.rows) {
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
      isDisposed = true
      if (pingInterval) clearInterval(pingInterval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      resizeObserver.disconnect()
      term.dispose()
      if (ws) ws.close()
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