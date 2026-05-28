import { useEffect, useState } from "react"
import { useFileTreeStore } from "../stores/fileTreeStore"
import { Database, CheckCircle2 } from "lucide-react"

export default function IndexingNotification() {
    const indexing = useFileTreeStore((s) => s.indexing)
    const [state, setState] = useState("hidden") // hidden, indexing, ready

    useEffect(() => {
        if (indexing) {
            setState("indexing")
        } else if (!indexing && state === "indexing") {
            setState("ready")
        }
    }, [indexing, state])

    useEffect(() => {
        if (state === "ready") {
            const timer = setTimeout(() => {
                setState("hidden")
            }, 3000)
            return () => clearTimeout(timer)
        }
    }, [state])

    return (
        <div
            className={`fixed bottom-10 right-10 z-50 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
                ${state === "hidden" ? "translate-y-12 opacity-0 pointer-events-none scale-95" : "translate-y-0 opacity-100 scale-100"}`}
        >
            <div className="bg-[#1a1b22]/90 border border-editor-border/40 shadow-2xl shadow-black/60 rounded-lg px-4 py-3 flex items-center gap-3.5 backdrop-blur-md">
                {state === "indexing" && (
                    <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 bg-blue-500/30 rounded-full animate-ping blur-[2px]"></div>
                        <Database size={18} className="text-blue-400 animate-pulse relative z-10" />
                    </div>
                )}
                {state === "ready" && (
                    <div className="relative flex items-center justify-center">
                        <div className="absolute inset-0 bg-green-500/20 rounded-full blur-[2px]"></div>
                        <CheckCircle2 size={18} className="text-green-400 relative z-10 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                    </div>
                )}
                
                <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-gray-200 tracking-wide">
                        {state === "indexing" ? "Indexing Codebase" : "Index Complete"}
                    </span>
                    <span className="text-[11px] text-gray-400 mt-0.5 font-medium">
                        {state === "indexing" 
                            ? "Analyzing files for AI context..." 
                            : "Your codebase is fully parsed."}
                    </span>
                </div>
            </div>
        </div>
    )
}
