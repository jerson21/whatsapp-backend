import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        set({ user, token, isAuthenticated: true })
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
      },

      getAuthHeader: () => {
        const state = useAuthStore.getState()
        if (state.token) {
          return { Authorization: `Basic ${state.token}` }
        }
        return {}
      }
    }),
    {
      name: 'auth-storage'
    }
  )
)
