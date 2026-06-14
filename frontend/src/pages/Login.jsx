import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { authApi } from "../lib/api"
import { useAuthStore } from "../stores/authStore"

// GitHub SVG mark
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

export default function Login() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const [ghLoading, setGhLoading] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const setTokens  = useAuthStore((s) => s.setTokens)
  const navigate   = useNavigate()
  const popupRef   = useRef(null)
  const timerRef   = useRef(null)

  const handleExitNavigate = (path) => {
    setIsExiting(true)
    setTimeout(() => {
      navigate(path)
    }, 350)
  }

  // Listen for postMessage from the OAuth popup
  useEffect(() => {
    const handleMessage = (event) => {
      const ALLOWED_ORIGINS = ["http://localhost:1842", "http://127.0.0.1:1842"]
      if (!ALLOWED_ORIGINS.includes(event.origin)) return
      
      const { type, access_token, refresh_token, error: ghError } = event.data ?? {}
      if (type === "GITHUB_AUTH_SUCCESS") {
        setGhLoading(false)
        setTokens(access_token, refresh_token)
        setIsExiting(true)
        setTimeout(() => {
          navigate("/projects")
        }, 350)
      } else if (type === "GITHUB_AUTH_ERROR") {
        setGhLoading(false)
        setError(ghError || "GitHub login failed. Please try again.")
      }
    }
    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
      clearInterval(timerRef.current)
    }
  }, [navigate, setTokens])

  const handleGitHubLogin = async () => {
    setError("")
    setGhLoading(true)
    try {
      const res = await authApi.getGithubLoginUrl()
      const url = res.data.url
      const w = 600, h = 700
      const left = window.screenX + (window.outerWidth - w) / 2
      const top  = window.screenY + (window.outerHeight - h) / 2
      popupRef.current = window.open(url, "github-oauth", `width=${w},height=${h},left=${left},top=${top}`)
      // If user closes popup manually, clear loading state
      timerRef.current = setInterval(() => {
        if (popupRef.current?.closed) {
          clearInterval(timerRef.current)
          setGhLoading(false)
        }
      }, 500)
    } catch {
      setGhLoading(false)
      setError("Could not initiate GitHub login. Is the backend running?")
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    try {
      const res = await authApi.login(email, password)
      setTokens(res.data.access_token, res.data.refresh_token)
      setIsExiting(true)
      setTimeout(() => {
        navigate("/projects")
      }, 350)
    } catch {
      setError("Invalid email or password.")
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center bg-editor-bg relative overflow-hidden ${isExiting ? "page-fade-out" : "page-fade-in"}`}>
      {/* Background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none glow-orb-1" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none glow-orb-2" />
      <div className="absolute top-[40%] left-[60%] w-[20%] h-[20%] bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none glow-orb-1" />

      <div className="w-full max-w-md z-10 backdrop-blur-xl bg-editor-sidebar/80 border border-editor-border/50 shadow-2xl hover:shadow-[0_0_50px_rgba(99,102,241,0.12)] rounded-2xl p-10 flex flex-col gap-6 transition-all duration-500">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-4 hover:scale-105 transition-transform duration-300">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Welcome to Antimatter</h1>
          <p className="text-editor-muted text-sm mt-1">Sign in to continue to your IDE</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {/* GitHub Button */}
        <button
          onClick={handleGitHubLogin}
          disabled={ghLoading}
          className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl bg-[#24292f] hover:bg-[#2d333b] border border-white/10 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {ghLoading ? <Spinner /> : <GitHubIcon />}
          {ghLoading ? "Waiting for GitHub…" : "Continue with GitHub"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-editor-border/40" />
          <span className="text-editor-muted/60 text-xs font-medium uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-editor-border/40" />
        </div>

        {/* Email / Password Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-editor-muted uppercase tracking-wider">Email Address</label>
            <input
              className="bg-[#12131a]/60 border border-editor-border/40 rounded-xl px-4 py-2.5 text-sm text-editor-text outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 focus:bg-[#12131a]/95 transition-all duration-300 placeholder:text-editor-muted/40"
              placeholder="you@example.com" type="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-editor-muted uppercase tracking-wider">Password</label>
            <input
              className="bg-[#12131a]/60 border border-editor-border/40 rounded-xl px-4 py-2.5 text-sm text-editor-text outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 focus:bg-[#12131a]/95 transition-all duration-300 placeholder:text-editor-muted/40"
              placeholder="••••••••" type="password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="mt-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]"
          >
            Sign in with Email
          </button>
        </form>

        <p className="text-center text-sm text-editor-muted">
          Don't have an account?{" "}
          <button 
            type="button"
            onClick={() => handleExitNavigate("/register")} 
            className="text-blue-400 hover:text-blue-300 font-medium transition-colors focus:outline-none"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  )
}