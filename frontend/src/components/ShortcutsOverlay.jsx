import { useEffect } from "react"
import { X, Keyboard } from "lucide-react"
import { SHORTCUTS } from "../hooks/useShortcuts"

function Kbd({ children }) {
  return (
    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md
      bg-editor-bg border border-editor-border/70 text-editor-text/90
      font-mono text-[11px] shadow-[0_2px_0_0] shadow-editor-border/40
      min-w-[26px] text-center leading-5">
      {children}
    </span>
  )
}

export default function ShortcutsOverlay({ onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl
          bg-editor-sidebar/95 backdrop-blur-xl
          border border-editor-border/50
          shadow-[0_32px_80px_rgba(0,0,0,0.6)]
          overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-editor-border/40 bg-editor-bg/30">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/20">
            <Keyboard size={16} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-white tracking-wide">Keyboard Shortcuts</h2>
            <p className="text-[11px] text-editor-muted/70 mt-0.5">AntiMatter IDE — all shortcuts</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto flex items-center justify-center w-7 h-7 rounded-lg
              text-editor-muted hover:text-white hover:bg-editor-highlight/60
              transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="grid grid-cols-2 gap-px p-1 bg-editor-border/20 max-h-[70vh] overflow-y-auto">
          {SHORTCUTS.map((group) => (
            <div
              key={group.group}
              className="bg-editor-sidebar/90 p-4 flex flex-col gap-2"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-editor-accent/80 mb-1">
                {group.group}
              </p>
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4 py-1 group"
                >
                  {/* Key combination */}
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <Kbd>{k}</Kbd>
                        {i < item.keys.length - 1 && (
                          <span className="text-editor-muted/40 text-[10px]">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                  {/* Label */}
                  <span className="text-[12px] text-editor-muted/80 group-hover:text-editor-text transition-colors text-right">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-editor-border/30 bg-editor-bg/20 flex items-center gap-2">
          <span className="text-[11px] text-editor-muted/50">Press</span>
          <Kbd>Esc</Kbd>
          <span className="text-[11px] text-editor-muted/50">or click outside to close</span>
        </div>
      </div>
    </div>
  )
}
