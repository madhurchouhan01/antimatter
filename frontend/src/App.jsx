import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useAuthStore } from "./stores/authStore"
import Login         from "./pages/Login"
import Register      from "./pages/Register"
import ProjectPicker from "./pages/ProjectPicker"
import Layout        from "./components/Layout"
import Toasts        from "./components/Toasts"

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
        <Route path="/projects" element={<Protected><ProjectPicker /></Protected>} />
        <Route path="/editor"   element={<Protected><Layout /></Protected>} />
        <Route path="*"         element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  )
}