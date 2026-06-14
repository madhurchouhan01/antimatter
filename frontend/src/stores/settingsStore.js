import { create } from "zustand"
import { persist } from "zustand/middleware"
import api from "../lib/api"

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      hasApiKey: false,
      isLoading: false,
      isSaving: false,
      error: null,
      settingsOpen: false,
      setSettingsOpen: (val) => set({ settingsOpen: val }),

      /** Load settings from backend on app mount */
      fetchSettings: async () => {
        set({ isLoading: true, error: null })
        try {
          const { data } = await api.get("/api/settings/")
          set({
            provider: data.provider,
            model: data.model,
            hasApiKey: data.has_api_key,
            isLoading: false,
          })
        } catch (err) {
          set({ isLoading: false, error: "Failed to load settings" })
        }
      },

      /** Save settings to backend; apiKey="" means clear the existing key */
      saveSettings: async (provider, model, apiKey) => {
        set({ isSaving: true, error: null })
        try {
          const body = { provider, model }
          // Only include api_key in the payload if the user actually typed something
          // or explicitly passed "" to clear it
          if (apiKey !== undefined) body.api_key = apiKey

          const { data } = await api.put("/api/settings/", body)
          set({
            provider: data.provider,
            model: data.model,
            hasApiKey: data.has_api_key,
            isSaving: false,
          })
          return true
        } catch (err) {
          set({
            isSaving: false,
            error: err?.response?.data?.detail || "Failed to save settings",
          })
          return false
        }
      },

      /** Optimistically update model in-store (e.g. from ChatPanel dropdown) */
      setModel: (model) => set({ model }),
    }),
    {
      name: "antimatter-settings",
      // Only persist provider/model locally as cache — canonical source is backend
      partialize: (state) => ({ provider: state.provider, model: state.model }),
    }
  )
)
