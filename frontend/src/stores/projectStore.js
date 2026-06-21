import { create } from "zustand"
import { persist } from "zustand/middleware"

export const useProjectStore = create(
  persist(
    (set) => ({
      projects: [],
      activeProject: null,
      setProjects:      (projects) => set({ projects }),
      setActiveProject: (project)  => set({ activeProject: project }),
      updateActiveProject: (project) => set((state) => ({
        activeProject: state.activeProject?.id === project.id ? project : state.activeProject,
        projects: state.projects.map((p) => (p.id === project.id ? project : p)),
      })),
    }),
    { name: "project-storage" }
  )
)
