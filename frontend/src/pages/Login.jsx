import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { authApi } from "../lib/api"
import { useAuthStore } from "../stores/authStore"

export default function Login() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const setTokens  = useAuthStore((s) => s.setTokens)
  const navigate   = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    try {
      const res = await authApi.login(email, password)
      setTokens(res.data.access_token, res.data.refresh_token)
      navigate("/projects")
    } catch {
      setError("Invalid credentials")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-editor-bg">
      <div className="w-full max-w-sm bg-editor-sidebar border border-editor-border rounded-xl p-8 flex flex-col gap-5">
        <h1 className="text-xl font-semibold text-editor-text">Sign in</h1>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <input
          className="bg-editor-highlight border border-editor-border rounded px-3 py-2 text-sm text-editor-text outline-none focus:border-blue-500"
          placeholder="Email" type="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="bg-editor-highlight border border-editor-border rounded px-3 py-2 text-sm text-editor-text outline-none focus:border-blue-500"
          placeholder="Password" type="password"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <button
          onClick={handleSubmit}
          className="bg-editor-accent hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          Sign in
        </button>
      </div>
    </div>
  )
}