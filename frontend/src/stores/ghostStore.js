import { create } from "zustand"

export const useGhostStore = create((set) => ({
  /** @type {{ text: string, line: number, col: number } | null} */
  ghost: null,
  setGhost:  (g) => set({ ghost: g }),
  clearGhost: ()  => set({ ghost: null }),
}))
