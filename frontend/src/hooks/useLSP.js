/**
 * useLSP — connects to the backend LSP WebSocket proxy and wires it to Monaco.
 *
 * Responsibilities:
 *  - Establishes a WS connection to /api/lsp/ws/{projectId}/{language}
 *  - Sends LSP `initialize` + `textDocument/didOpen` when a file is opened
 *  - Sends `textDocument/didChange` on each keystroke (debounced)
 *  - Maps LSP `publishDiagnostics` → Monaco model markers (red/yellow squiggles)
 *  - Maps LSP `hover` → Monaco hover provider
 *  - Maps LSP `completion` → Monaco completion provider
 */

import { useEffect, useRef, useCallback } from "react"
import { useAuthStore } from "../stores/authStore"

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:1842"
const WS_BASE  = API_BASE.replace(/^http/, "ws")

// LSP message ID counter (per tab)
let _msgId = 1
const nextId = () => _msgId++

// Map file extension → LSP language id
const EXT_LANG = {
  py:  "python",
  js:  "javascript",
  jsx: "javascript",
  ts:  "typescript",
  tsx: "typescript",
}

function getLanguage(path) {
  const ext = path?.split(".").pop()
  return EXT_LANG[ext] ?? null
}

// LSP severity → Monaco MarkerSeverity
function lspSeverityToMonaco(monaco, sev) {
  switch (sev) {
    case 1:  return monaco.MarkerSeverity.Error
    case 2:  return monaco.MarkerSeverity.Warning
    case 3:  return monaco.MarkerSeverity.Info
    default: return monaco.MarkerSeverity.Hint
  }
}

export function useLSP(projectId, monacoRef) {
  const token       = useAuthStore((s) => s.token)
  const wsMap       = useRef({})          // lang → WebSocket
  const pendingMap  = useRef({})          // lang → Map<id, resolve>
  const disposables = useRef([])          // Monaco provider disposables
  const providersRegistered = useRef(false)

  // ------------------------------------------------------------------
  // Send a raw LSP JSON-RPC message
  // ------------------------------------------------------------------
  const lspSend = useCallback((lang, msg) => {
    const ws = wsMap.current[lang]
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  // ------------------------------------------------------------------
  // Send a request and get a Promise back
  // ------------------------------------------------------------------
  const lspRequest = useCallback((lang, method, params) => {
    return new Promise((resolve) => {
      const id = nextId()
      pendingMap.current[lang] ??= new Map()
      pendingMap.current[lang].set(id, resolve)
      lspSend(lang, { jsonrpc: "2.0", id, method, params })
      // Timeout after 3s to avoid dangling promises
      setTimeout(() => {
        if (pendingMap.current[lang]?.has(id)) {
          pendingMap.current[lang].delete(id)
          resolve(null)
        }
      }, 3000)
    })
  }, [lspSend])

  // ------------------------------------------------------------------
  // Handle incoming LSP message
  // ------------------------------------------------------------------
  const handleMessage = useCallback((lang, raw) => {
    const monaco = monacoRef?.current
    if (!monaco) return

    let msg
    try { msg = JSON.parse(raw) } catch { return }

    // Response to a pending request
    if (msg.id !== undefined && pendingMap.current[lang]?.has(msg.id)) {
      pendingMap.current[lang].get(msg.id)(msg.result)
      pendingMap.current[lang].delete(msg.id)
      return
    }

    // Notification: diagnostics
    if (msg.method === "textDocument/publishDiagnostics") {
      const { uri, diagnostics } = msg.params
      const model = monaco.editor.getModels().find((m) => m.uri.toString() === uri)
      if (!model) return

      const markers = diagnostics.map((d) => ({
        severity:        lspSeverityToMonaco(monaco, d.severity),
        message:         d.message,
        startLineNumber: d.range.start.line + 1,
        startColumn:     d.range.start.character + 1,
        endLineNumber:   d.range.end.line + 1,
        endColumn:       d.range.end.character + 1,
        source:          d.source ?? "lsp",
        code:            typeof d.code === "number" ? String(d.code) : (d.code ?? undefined),
      }))
      monaco.editor.setModelMarkers(model, "lsp", markers)
    }
  }, [monacoRef])

  // ------------------------------------------------------------------
  // Connect to LSP WS for a given language (idempotent)
  // ------------------------------------------------------------------
  const connectLang = useCallback((lang) => {
    if (wsMap.current[lang]) return
    if (!projectId || !token) return

    const url = `${WS_BASE}/api/lsp/ws/${projectId}/${lang}?token=${token}`
    const ws  = new WebSocket(url)
    wsMap.current[lang] = ws

    ws.onopen = () => {
      lspSend(lang, {
        jsonrpc: "2.0",
        id:      nextId(),
        method:  "initialize",
        params: {
          processId: null,
          rootUri:   "file:///workspace",
          capabilities: {
            textDocument: {
              publishDiagnostics: { relatedInformation: true },
              hover:              { contentFormat: ["plaintext", "markdown"] },
              completion:         { completionItem: { snippetSupport: true } },
              synchronization:    { didSave: true },
            },
          },
        },
      })
    }

    ws.onmessage = (e) => handleMessage(lang, e.data)
    ws.onerror   = (e) => console.warn(`LSP [${lang}] error`, e)
    ws.onclose   = ()  => { delete wsMap.current[lang] }
  }, [projectId, token, lspSend, handleMessage])

  // ------------------------------------------------------------------
  // Register Monaco providers (hover + completion) — once per session
  // ------------------------------------------------------------------
  const registerProviders = useCallback((monaco) => {
    if (providersRegistered.current) return
    providersRegistered.current = true

    // Hover
    disposables.current.push(
      monaco.languages.registerHoverProvider(
        ["python", "javascript", "typescript"],
        {
          async provideHover(model, position) {
            const lang = getLanguage(model.uri.path)
            if (!lang || !wsMap.current[lang]) return null

            const result = await lspRequest(lang, "textDocument/hover", {
              textDocument: { uri: model.uri.toString() },
              position:     { line: position.lineNumber - 1, character: position.column - 1 },
            })
            if (!result?.contents) return null

            const contents = Array.isArray(result.contents)
              ? result.contents
              : [result.contents]

            return {
              contents: contents.map((c) => ({
                value: typeof c === "string" ? c : (c.value ?? ""),
              })),
            }
          },
        }
      )
    )

    // Completion
    disposables.current.push(
      monaco.languages.registerCompletionItemProvider(
        ["python", "javascript", "typescript"],
        {
          triggerCharacters: [".", "(", "[", "\"", "'"],
          async provideCompletionItems(model, position) {
            const lang = getLanguage(model.uri.path)
            if (!lang || !wsMap.current[lang]) return { suggestions: [] }

            const result = await lspRequest(lang, "textDocument/completion", {
              textDocument: { uri: model.uri.toString() },
              position:     { line: position.lineNumber - 1, character: position.column - 1 },
            })

            const items = result?.items ?? result ?? []
            const word  = model.getWordUntilPosition(position)
            const range = new monaco.Range(
              position.lineNumber, word.startColumn,
              position.lineNumber, word.endColumn,
            )

            return {
              suggestions: items.map((item) => ({
                label:           item.label,
                kind:            item.kind ?? monaco.languages.CompletionItemKind.Text,
                insertText:      item.insertText ?? item.label,
                insertTextRules: item.insertTextFormat === 2
                  ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  : undefined,
                documentation:   item.documentation?.value ?? item.documentation,
                detail:          item.detail,
                range,
              })),
            }
          },
        }
      )
    )
  }, [lspRequest])

  // ------------------------------------------------------------------
  // Public: call when a file is opened in the editor
  // ------------------------------------------------------------------
  const onFileOpen = useCallback((path, content, monaco) => {
    const lang = getLanguage(path)
    if (!lang || !monaco) return

    connectLang(lang)
    registerProviders(monaco)

    const uri = `file:///workspace/${path}`

    // Wait briefly for the WS to be ready before sending didOpen
    const ws = wsMap.current[lang]
    const send = () => lspSend(lang, {
      jsonrpc: "2.0",
      method:  "textDocument/didOpen",
      params: {
        textDocument: { uri, languageId: lang, version: 1, text: content },
      },
    })

    if (ws?.readyState === WebSocket.OPEN) {
      send()
    } else if (ws) {
      ws.addEventListener("open", send, { once: true })
    }
  }, [connectLang, registerProviders, lspSend])

  // ------------------------------------------------------------------
  // Public: call on every editor change (debounce in the caller)
  // ------------------------------------------------------------------
  const onFileChange = useCallback((path, content, version) => {
    const lang = getLanguage(path)
    if (!lang) return
    lspSend(lang, {
      jsonrpc: "2.0",
      method:  "textDocument/didChange",
      params: {
        textDocument:   { uri: `file:///workspace/${path}`, version },
        contentChanges: [{ text: content }],
      },
    })
  }, [lspSend])

  // ------------------------------------------------------------------
  // Cleanup on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      Object.values(wsMap.current).forEach((ws) => ws.close())
      disposables.current.forEach((d) => d.dispose())
      providersRegistered.current = false
    }
  }, [])

  return { onFileOpen, onFileChange }
}