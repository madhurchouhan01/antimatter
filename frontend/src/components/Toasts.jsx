import { useToastStore } from "../stores/toastStore"
import { AlertCircle, CheckCircle2, X } from "lucide-react"

export default function Toasts() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  const icons = {
    error:   <AlertCircle className="text-red-400 shrink-0" size={16} />,
    success: <CheckCircle2 className="text-green-400 shrink-0" size={16} />,
    warning: <AlertCircle className="text-amber-400 shrink-0" size={16} />,
  }

  const styles = {
    error:   "bg-red-950/90 border-red-500/30 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.15)]",
    success: "bg-green-950/90 border-green-500/30 text-green-200 shadow-[0_0_24px_rgba(34,197,94,0.15)]",
    warning: "bg-amber-950/90 border-amber-500/30 text-amber-200 shadow-[0_0_24px_rgba(245,158,11,0.15)]",
  }

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-xl border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-right-4 fade-in ${styles[toast.type] || styles.error}`}
        >
          <div className="flex gap-2.5 min-w-0">
            {icons[toast.type] || icons.error}
            <span className="text-[12.5px] font-medium leading-relaxed break-words pr-2">
              {toast.message}
            </span>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-white/40 hover:text-white p-0.5 rounded transition-colors shrink-0 mt-0.5"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
