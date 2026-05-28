import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { authApi } from "../lib/api"

export default function Register() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [name, setName]         = useState("")
  const [error, setError]       = useState("")
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    try {
      await authApi.register(email, password, name)
      navigate("/login")
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-editor-bg relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md z-10 backdrop-blur-xl bg-editor-sidebar/80 border border-editor-border/50 shadow-2xl rounded-2xl p-10 flex flex-col gap-6 transform transition-all">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Create Account</h1>
          <p className="text-editor-muted text-sm">Sign up to get started with Antimatter</p>
        </div>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <p className="text-red-400 text-sm text-center font-medium">{error}</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-editor-muted uppercase tracking-wider">Full Name</label>
            <input
              className="bg-editor-bg/50 border border-editor-border/50 rounded-lg px-4 py-2.5 text-sm text-editor-text outline-none focus:border-blue-500 focus:bg-editor-highlight/50 transition-colors"
              placeholder="John Doe" type="text"
              value={name} onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-editor-muted uppercase tracking-wider">Email Address</label>
            <input
              className="bg-editor-bg/50 border border-editor-border/50 rounded-lg px-4 py-2.5 text-sm text-editor-text outline-none focus:border-blue-500 focus:bg-editor-highlight/50 transition-colors"
              placeholder="you@example.com" type="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-editor-muted uppercase tracking-wider">Password</label>
            <input
              className="bg-editor-bg/50 border border-editor-border/50 rounded-lg px-4 py-2.5 text-sm text-editor-text outline-none focus:border-blue-500 focus:bg-editor-highlight/50 transition-colors"
              placeholder="••••••••" type="password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          
          <button
            type="submit"
            className="mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]"
          >
            Sign Up
          </button>
        </form>

        <p className="text-center text-sm text-editor-muted mt-2">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
