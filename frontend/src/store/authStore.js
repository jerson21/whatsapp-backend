import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,       // backward compat
      agent: null,      // { id, username, name, email, role, departmentId, avatarColor }
      token: null,      // JWT token
      basicToken: null, // Legacy Basic auth token (para EventSource)
      isAuthenticated: false,

      login: (agent, token, basicToken) => {
        set({
          user: agent,  // backward compat
          agent,
          token,
          basicToken,
          isAuthenticated: true
        })
      },

      logout: () => {
        set({ user: null, agent: null, token: null, basicToken: null, isAuthenticated: false })
      }
    }),
    {
      name: 'auth-storage'
    }
  )
)
