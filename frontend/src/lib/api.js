import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://127.0.0.1:1842",
})

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auth endpoints
export const authApi = {
  register: (email, password, name) =>
    api.post("/api/auth/register", { email, password, name }),
  login: (email, password) =>
    api.post("/api/auth/login", { email, password }),
  logout: (refresh_token) =>
    api.post("/api/auth/logout", { refresh_token }),
}

// Project endpoints
export const projectsApi = {
  list: ()           => api.get("/api/projects/list_projects"),
  create: (name, description) =>
    api.post("/api/projects/", { name, description }),
  delete: (id)       => api.delete(`/api/projects/${id}`),
}

// File endpoints
export const filesApi = {
  list:  (projectId, path = "") =>
    api.get(`/api/files/${projectId}/list`, { params: { path } }),
  read:  (projectId, path) =>
    api.get(`/api/files/${projectId}/read`, { params: { path } }),
  write: (projectId, path, content) =>
    api.post(`/api/files/${projectId}/write`, { path, content }),
}

// Conversation endpoints
export const conversationsApi = {
  list:     (projectId) =>
    api.get(`/api/projects/${projectId}/conversations`),
  messages: (projectId, convId) =>
    api.get(`/api/projects/${projectId}/conversations/${convId}/messages`),
}

export default api