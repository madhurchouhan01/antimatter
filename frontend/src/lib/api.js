import axios from "axios"
import { useToastStore } from "../stores/toastStore"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://127.0.0.1:1842",
})

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Catch response errors globally and alert the user with Toasts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.config && error.config.__skipToast) {
      return Promise.reject(error)
    }

    const data = error.response?.data
    const message = data?.detail || data?.message || error.message || "A connection error occurred. Is the server running?"
    
    useToastStore.getState().addToast(message, "error")
    return Promise.reject(error)
  }
)

// Auth endpoints
export const authApi = {
  register: (email, password, name) =>
    api.post("/api/auth/register", { email, password, name }, { __skipToast: true }),
  login: (email, password) =>
    api.post("/api/auth/login", { email, password }, { __skipToast: true }),
  logout: (refresh_token) =>
    api.post("/api/auth/logout", { refresh_token }, { __skipToast: true }),
  getGithubLoginUrl: () =>
    api.get("/api/auth/github/login", { __skipToast: true }),
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
  applyPatch: (projectId, path, content) =>
    api.post(`/api/files/${projectId}/apply-patch`, { path, content }),
  upload: (projectId, path, file) => {
    const formData = new FormData()
    formData.append("path", path)
    formData.append("file", file)
    return api.post(`/api/files/${projectId}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
  delete: (projectId, path) =>
    api.delete(`/api/files/${projectId}`, { params: { path } }),
}

// Conversation endpoints
export const conversationsApi = {
  list:     (projectId) =>
    api.get(`/api/projects/${projectId}/conversations`),
  messages: (projectId, convId) =>
    api.get(`/api/projects/${projectId}/conversations/${convId}/messages`),
  update:   (projectId, convId, title) =>
    api.put(`/api/projects/${projectId}/conversations/${convId}`, { title }),
  delete:   (projectId, convId) =>
    api.delete(`/api/projects/${projectId}/conversations/${convId}`),
}

// Settings endpoints
export const settingsApi = {
  get:       ()                           => api.get("/api/settings/"),
  save:      (provider, model, apiKey)    => api.put("/api/settings/", { provider, model, api_key: apiKey }),
  getModels: ()                           => api.get("/api/settings/models"),
}

// Episodic Memory endpoints
export const memoriesApi = {
  list:   (projectId, page = 1, pageSize = 100) =>
    api.get(`/api/projects/${projectId}/memories`, { params: { page, page_size: pageSize } }),
  delete: (projectId, memoryId) =>
    api.delete(`/api/projects/${projectId}/memories/${memoryId}`),
}

export default api