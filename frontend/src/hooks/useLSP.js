import { useEffect } from "react"
import { lspClient } from "../services/lspClient"
import { useAuthStore } from "../stores/authStore"
import { useProjectStore } from "../stores/projectStore"

export function useLSP(monacoRef, editorRef, filePath, language) {
  const token   = useAuthStore((s) => s.token)
  const project = useProjectStore((s) => s.activeProject)

  useEffect(() => {
    if (!project || !monacoRef.current || !editorRef.current || !filePath) return

    lspClient.connect(project.id, language, token)

    // Push diagnostics into Monaco markers
    lspClient.onNotification("textDocument/publishDiagnostics", (params) => {
      const monaco = monacoRef.current
      const model  = editorRef.current.getModel()
      if (!model) return

      const markers = params.diagnostics.map((d) => ({
        severity:  d.severity === 1
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
        message:   d.message,
        startLineNumber: d.range.start.line + 1,
        startColumn:     d.range.start.character + 1,
        endLineNumber:   d.range.end.line + 1,
        endColumn:       d.range.end.character + 1,
      }))

      monaco.editor.setModelMarkers(model, "lsp", markers)
    })

    // Notify LSP when file opens
    lspClient.notify(language, "textDocument/didOpen", {
      textDocument: {
        uri:        `file://${filePath}`,
        languageId: language,
        version:    1,
        text:       editorRef.current.getValue(),
      }
    })

    return () => {
      lspClient.notify(language, "textDocument/didClose", {
        textDocument: { uri: `file://${filePath}` }
      })
    }
  }, [filePath, language, project, token, monacoRef, editorRef])
}