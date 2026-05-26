import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useAuthStore } from "./stores/authStore"
import Login         from "./pages/Login"
import ProjectPicker from "./pages/ProjectPicker"
import Layout        from "./components/Layout"

function Protected({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/projects" element={<Protected><ProjectPicker /></Protected>} />
        <Route path="/editor"   element={<Protected><Layout /></Protected>} />
        <Route path="*"         element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  )
}