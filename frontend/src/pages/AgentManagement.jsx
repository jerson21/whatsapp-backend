import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { UserPlus, Edit, Trash2, Key, Eye, EyeOff, Shield, User } from 'lucide-react'

const getHeaders = () => {
  const token = useAuthStore.getState().token
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

export default function AgentManagement() {
  const { t } = useTranslation('agents')
  const [agents, setAgents] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)
  const [showApiKey, setShowApiKey] = useState({})
  const [form, setForm] = useState({ username: '', password: '', name: '', email: '', role: 'agent', departmentId: '', avatarColor: '#6366f1' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    try {
      const [agentsRes, deptsRes] = await Promise.all([
        fetch('/api/agents', { headers: getHeaders() }),
        fetch('/api/departments', { headers: getHeaders() })
      ])
      const agentsData = await agentsRes.json()
      const deptsData = await deptsRes.json()
      if (agentsData.ok) setAgents(agentsData.agents)
      if (deptsData.ok) setDepartments(deptsData.departments)
    } catch (e) {
      console.error('Error loading data:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openCreate = () => {
    setEditingAgent(null)
    setForm({ username: '', password: '', name: '', email: '', role: 'agent', departmentId: '', avatarColor: '#6366f1' })
    setError('')
    setShowModal(true)
  }

  const openEdit = (agent) => {
    setEditingAgent(agent)
    setForm({
      username: agent.username,
      password: '',
      name: agent.name,
      email: agent.email || '',
      role: agent.role,
      departmentId: agent.department_id || '',
      avatarColor: agent.avatar_color || '#6366f1'
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const body = {
        name: form.name,
        email: form.email || null,
        role: form.role,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        avatarColor: form.avatarColor
      }

      if (editingAgent) {
        if (form.password) body.password = form.password
        const res = await fetch(`/api/agents/${editingAgent.id}`, {
          method: 'PUT', headers: getHeaders(), body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error)
      } else {
        body.username = form.username
        body.password = form.password
        const res = await fetch('/api/agents', {
          method: 'POST', headers: getHeaders(), body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error)
      }

      setShowModal(false)
      loadData()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (agent) => {
    if (!confirm(t('deleteConfirm', { name: agent.name }))) return
    try {
      await fetch(`/api/agents/${agent.id}`, { method: 'DELETE', headers: getHeaders() })
      loadData()
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  const handleRegenerateKey = async (agent) => {
    if (!confirm(t('regenerateKeyConfirm', { name: agent.name }))) return
    try {
      const res = await fetch(`/api/agents/${agent.id}/regenerate-api-key`, {
        method: 'POST', headers: getHeaders()
      })
      const data = await res.json()
      if (data.ok) {
        loadData()
        alert(`Nueva API key: ${data.apiKey}`)
      }
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4']

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full"></div></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('subtitle')}</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg transition font-medium">
          <UserPlus className="w-4 h-4" /> {t('addAgent')}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{t('agent')}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{t('role')}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{t('department')}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{t('status')}</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">API Key</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{t('lastLogin')}</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {agents.map(agent => (
              <tr key={agent.id} className={`hover:bg-gray-50 ${agent.status === 'inactive' ? 'opacity-50' : ''}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: agent.avatar_color || '#6366f1' }}>
                      <span className="text-white text-sm font-medium">{agent.name?.[0]?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{agent.name}</p>
                      <p className="text-xs text-gray-400">@{agent.username}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    agent.role === 'supervisor' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {agent.role === 'supervisor' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {agent.role === 'supervisor' ? t('supervisor') : t('agent')}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {agent.department_name ? (
                    <span className="text-sm px-2 py-1 rounded-full" style={{ backgroundColor: `${agent.department_color}20`, color: agent.department_color }}>
                      {agent.department_name}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">{t('noDepartment')}</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    agent.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {agent.status === 'active' ? t('active') : t('inactive')}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <code className="text-xs text-gray-400 font-mono">
                      {showApiKey[agent.id] ? agent.api_key : (agent.api_key ? '••••••••' : '-')}
                    </code>
                    {agent.api_key && (
                      <button onClick={() => setShowApiKey(prev => ({ ...prev, [agent.id]: !prev[agent.id] }))} className="p-1 text-gray-400 hover:text-gray-600">
                        {showApiKey[agent.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs text-gray-400">
                    {agent.last_login ? new Date(agent.last_login).toLocaleString() : t('never')}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(agent)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title={t('common:actions.edit')}>
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleRegenerateKey(agent)} className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg" title={t('regenerateKey')}>
                      <Key className="w-4 h-4" />
                    </button>
                    {agent.status === 'active' && (
                      <button onClick={() => handleDelete(agent)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title={t('deactivate')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!agents.length && (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">{t('noAgents')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingAgent ? t('editAgent') : t('addAgent')}
            </h2>

            {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>}

            <form onSubmit={handleSave} className="space-y-4">
              {!editingAgent && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('username')}</label>
                  <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required minLength={3} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingAgent ? t('passwordPlaceholder') : t('password')}
                </label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  required={!editingAgent} minLength={6} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('name')}</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('role')}</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="agent">{t('agent')}</option>
                    <option value="supervisor">{t('supervisor')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('department')}</label>
                  <select value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">{t('noDepartment')}</option>
                    {departments.filter(d => d.active).map(d => (
                      <option key={d.id} value={d.id}>{d.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('avatarColor')}</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, avatarColor: c })}
                      className={`w-8 h-8 rounded-full transition ${form.avatarColor === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">
                  {t('common:actions.cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50">
                  {saving ? t('saving') : (editingAgent ? t('common:actions.save') : t('common:actions.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
