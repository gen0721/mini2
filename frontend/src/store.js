import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

export const api = axios.create({ baseURL: `${BASE}/api` })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('mn_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('mn_token')
    useStore.getState().setUser(null)
  }
  return Promise.reject(err)
})

export const useStore = create(
  persist(
    (set, get) => ({
      user: null,
      hydrated: false,
      setUser: user => set({ user }),
      setHydrated: () => set({ hydrated: true }),
      logout: () => { localStorage.removeItem('mn_token'); set({ user: null }) },
      categories: [],
      setCategories: cats => set({ categories: cats }),

      // Подтягивает свежие данные юзера с сервера (баланс, рейтинг и т.д.)
      refreshUser: async () => {
        const token = localStorage.getItem('mn_token')
        if (!token || !get().user) return
        try {
          const { data } = await api.get('/auth/me')
          if (data) set({ user: data })
        } catch { /* тихо игнорируем */ }
      },
    }),
    {
      name: 'mn_store',
      partialize: state => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated()
      },
    }
  )
)
