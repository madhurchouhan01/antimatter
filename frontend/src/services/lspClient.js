import { useAuthStore } from "../stores/authStore"

class LSPClient {
  constructor() {
    this._sockets = {}      // language → WebSocket
    this._handlers = {}     // method → callback
    this._pendingRequests = {}  // id → { resolve, reject }
    this._nextId = 1
  }

  connect(projectId, language, token) {
    if (this._sockets[language]?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(
      `ws://127.0.0.1:1842/api/lsp/ws/${projectId}/${language}?token=${token}`
    )
    this._sockets[language] = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.id && this._pendingRequests[msg.id]) {
          const { resolve } = this._pendingRequests[msg.id]
          delete this._pendingRequests[msg.id]
          resolve(msg.result)
        } else if (msg.method && this._handlers[msg.method]) {
          this._handlers[msg.method](msg.params)
        }
      } catch {}
    }

    ws.onopen = () => {
      // LSP initialize handshake
      this.request(language, "initialize", {
        processId: null,
        rootUri: `file:///workspace`,
        capabilities: {
          textDocument: {
            completion:   { completionItem: { snippetSupport: true } },
            hover:        { contentFormat: ["markdown", "plaintext"] },
            diagnostics:  {},
            definition:   {},
            references:   {},
            formatting:   {},
          }
        },
        initializationOptions: {}
      }).then(() => this.notify(language, "initialized", {}))
    }
  }

  request(language, method, params) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++
      this._pendingRequests[id] = { resolve, reject }
      this._send(language, { jsonrpc: "2.0", id, method, params })
    })
  }

  notify(language, method, params) {
    this._send(language, { jsonrpc: "2.0", method, params })
  }

  onNotification(method, handler) {
    this._handlers[method] = handler
  }

  _send(language, message) {
    const ws = this._sockets[language]
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  disconnect(language) {
    this._sockets[language]?.close()
    delete this._sockets[language]
  }
}

export const lspClient = new LSPClient()