import { create } from 'zustand'

export const useAgentStore = create((set) => ({
  agents: [],
  departments: [],
  onlineAgents: new Set(),

  setAgents: (agents) => set({ agents }),
  setDepartments: (departments) => set({ departments }),

  setOnlineAgents: (ids) => set({ onlineAgents: new Set(ids) }),
  addOnlineAgent: (id) => set((s) => {
    const next = new Set(s.onlineAgents)
    next.add(id)
    return { onlineAgents: next }
  }),
  removeOnlineAgent: (id) => set((s) => {
    const next = new Set(s.onlineAgents)
    next.delete(id)
    return { onlineAgents: next }
  })
}))
