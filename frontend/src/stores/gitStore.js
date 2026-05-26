import { create } from "zustand"

export const useGitStore = create((set) => ({
  status:    null,    // GitStatus object
  diff:      "",
  commits:   [],
  loading:   false,

  setStatus:  (status)  => set({ status }),
  setDiff:    (diff)    => set({ diff }),
  setCommits: (commits) => set({ commits }),
  setLoading: (val)     => set({ loading: val }),
}))