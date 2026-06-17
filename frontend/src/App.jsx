import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useAuthStore } from "./stores/authStore"
import Login         from "./pages/Login"
import Register      from "./pages/Register"
import ProjectPicker from "./pages/ProjectPicker"
import Layout        from "./components/Layout"
import Toasts        from "./components/Toasts"
import ErrorBoundary from "./components/ErrorBoundary"

function Protected({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toasts />
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/projects" element={<Protected><ErrorBoundary><ProjectPicker /></ErrorBoundary></Protected>} />
        <Route path="/editor"   element={<Protected><ErrorBoundary><Layout /></ErrorBoundary></Protected>} />
        <Route path="*"         element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  )
}