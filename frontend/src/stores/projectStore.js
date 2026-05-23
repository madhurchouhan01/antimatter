import { create } from "zustand"
import { persist } from "zustand/middleware"

export const useProjectStore = create(
  persist(
    (set) => ({
      projects: [],
      activeProject: null,
      setProjects:      (projects) => set({ projects }),
      setActiveProject: (project)  => set({ activeProject: project }),
    }),
    { name: "project-storage" }
  )
)
