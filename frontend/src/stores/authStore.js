import { create } from "zustand"
import { persist } from "zustand/middleware"

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setTokens: (access, refresh) => {
        localStorage.setItem("access_token", access)
        set({ token: access, refreshToken: refresh })
      },
      clearAuth: () => {
        localStorage.removeItem("access_token")
        set({ token: null, refreshToken: null, user: null })
      },
    }),
    { name: "auth-storage" }
  )
)