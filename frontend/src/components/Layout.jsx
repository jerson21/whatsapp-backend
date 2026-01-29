import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import {
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  LogOut,
  Bot,
  Activity,
  Users,
  BarChart3,
  Radio,
  UserCog,
  Building2
} from 'lucide-react'

export default function Layout() {
  const navigate = useNavigate()
  const { agent, logout } = useAuthStore()
  const isSupervisor = agent?.role === 'supervisor'

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/conversations', icon: MessageSquare, label: 'Conversaciones' },
    ...(isSupervisor ? [
      { to: '/agents', icon: UserCog, label: 'Agentes' },
      { to: '/departments', icon: Building2, label: 'Departamentos' },
      { to: '/flows', icon: GitBranch, label: 'Flujos' },
      { to: '/logs', icon: Activity, label: 'Logs' },
      { to: '/leads', icon: Users, label: 'Leads' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/monitor', icon: Radio, label: 'Monitor' }
    ] : [])
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const roleName = isSupervisor ? 'Supervisor' : 'Agente'

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-200">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-700 rounded-xl flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-800">WhatsApp Bot</h1>
            <p className="text-xs text-gray-400">Platform</p>
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
                    ? 'bg-green-50 text-green-600 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

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
              title="Cerrar sesion"
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
