import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  MessageSquare,
  MessageCircle,
  GitBranch,
  LogOut,
  Bot,
  Activity,
  Users,
  BarChart3,
  Radio,
  UserCog,
  Building2,
  Brain,
  Languages
} from 'lucide-react'

export default function Layout() {
  const navigate = useNavigate()
  const { agent, logout } = useAuthStore()
  const { t, i18n } = useTranslation('common')
  const isSupervisor = agent?.role === 'supervisor'

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/conversations', icon: MessageSquare, label: t('nav.conversations') },
    { to: '/instagram-comments', icon: MessageCircle, label: 'IG Comentarios' },
    ...(isSupervisor ? [
      { to: '/agents', icon: UserCog, label: t('nav.agents') },
      { to: '/departments', icon: Building2, label: t('nav.departments') },
      { to: '/flows', icon: GitBranch, label: t('nav.flows') },
      { to: '/logs', icon: Activity, label: t('nav.logs') },
      { to: '/leads', icon: Users, label: t('nav.leads') },
      { to: '/analytics', icon: BarChart3, label: t('nav.analytics') },
      { to: '/monitor', icon: Radio, label: t('nav.monitor') },
      { to: '/learning', icon: Brain, label: t('nav.learning') }
    ] : [])
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const toggleLanguage = () => {
    const newLang = i18n.language?.startsWith('es') ? 'en' : 'es'
    i18n.changeLanguage(newLang)
  }

  const roleName = isSupervisor ? t('roles.supervisor') : t('roles.agent')

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-200">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-800">{t('platformName')}</h1>
            <p className="text-xs text-gray-400">{t('companyName')}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Language Toggle */}
        <div className="px-4 mb-2">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <Languages className="w-5 h-5" />
            <span>{i18n.language?.startsWith('es') ? 'English' : 'Español'}</span>
          </button>
        </div>

        {/* User */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: agent?.avatarColor || '#6366f1' }}
              >
                <span className="text-white font-medium text-sm">
                  {agent?.name?.[0]?.toUpperCase() || agent?.username?.[0]?.toUpperCase() || 'A'}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-800 text-sm">{agent?.name || agent?.username || 'Admin'}</p>
                <p className="text-xs text-gray-400">{roleName}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
              title={t('logout')}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
