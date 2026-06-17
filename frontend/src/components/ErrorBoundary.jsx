import React from "react"
import { AlertOctagon, RefreshCw, Copy, Check, ChevronDown, ChevronRight } from "lucide-react"

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null, 
      copied: false, 
      showDetails: false 
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error("React Error Boundary caught an uncaught exception:", error, errorInfo)
  }

  handleCopy = () => {
    const logText = `Error: ${this.state.error?.message}\n\nStack Trace:\n${this.state.error?.stack}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack}`
    navigator.clipboard.writeText(logText).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen w-screen bg-[#1a1b26] p-6 text-gray-200">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-red-500/20 bg-[#1f2335]/80 p-8 shadow-2xl backdrop-blur-xl animate-in fade-in duration-300">
            {/* Glowing background highlights */}
            <div className="absolute -left-16 -top-16 w-40 h-40 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
            <div className="absolute -right-16 -bottom-16 w-40 h-40 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

            <div className="relative flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6 shadow-inner animate-pulse">
                <AlertOctagon size={32} />
              </div>
              
              <h1 className="text-xl font-bold tracking-wide text-white uppercase mb-2">
                Interface Rendering Exception
              </h1>
              
              <p className="text-sm text-gray-400 max-w-md mb-8 leading-relaxed">
                A critical rendering error occurred in the application. You can copy the diagnostic logs or try reloading the workspace.
              </p>

              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={this.handleReload}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/40 text-red-300 font-semibold text-sm transition-all duration-200 shadow-md"
                >
                  <RefreshCw size={15} />
                  Reload Workspace
                </button>
                <button
                  onClick={this.handleCopy}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700/80 border border-gray-700 text-gray-300 font-semibold text-sm transition-all duration-200 shadow-sm"
                >
                  {this.state.copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                  {this.state.copied ? "Copied Logs" : "Copy Diagnostics"}
                </button>
              </div>

              {/* Error Details Accordion */}
              <div className="w-full text-left bg-black/30 rounded-xl border border-gray-800 overflow-hidden">
                <button
                  onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-white/5 transition-all outline-none"
                >
                  <span>Technical details</span>
                  {this.state.showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                
                {this.state.showDetails && (
                  <div className="p-4 border-t border-gray-800/80 font-mono text-[11.5px] leading-relaxed max-h-60 overflow-y-auto scrollbar-thin text-red-400 bg-black/20 selection:bg-red-500/20">
                    <div className="font-bold mb-1 text-white select-all">
                      {this.state.error?.toString()}
                    </div>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="mt-2 text-gray-500 whitespace-pre-wrap select-all font-mono">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
