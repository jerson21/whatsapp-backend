import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { login as apiLogin } from '../api/auth'
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const { t, i18n } = useTranslation('login')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { agent, token, basicToken } = await apiLogin(username, password)
      login(agent, token, basicToken)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || t('error'))
    } finally {
      setLoading(false)
    }
  }

  const toggleLanguage = () => {
    const newLang = i18n.language?.startsWith('es') ? 'en' : 'es'
    i18n.changeLanguage(newLang)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-5 relative">
      {/* Language Toggle */}
      <button
        onClick={toggleLanguage}
        className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-white/80 rounded-lg transition"
      >
        <Languages className="w-4 h-4" />
        <span>{i18n.language?.startsWith('es') ? 'EN' : 'ES'}</span>
      </button>

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-18 h-18 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5 p-4">
            <svg className="w-11 h-11 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Chat Platform
          </h1>
          <p className="text-gray-500 text-sm">
            {t('subtitle')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm mb-5 border border-red-200">
              {error}
            </div>
          )}

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('username')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base outline-none transition-colors focus:border-indigo-500"
              placeholder={t('usernamePlaceholder')}
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base outline-none transition-colors focus:border-indigo-500"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-semibold py-3.5 px-5 rounded-xl text-base transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? t('submitting') : t('submit')}
          </button>
        </form>

        <p className="text-center text-gray-400 text-xs mt-8">
          {t('footer')}
        </p>
      </div>
    </div>
  )
}
