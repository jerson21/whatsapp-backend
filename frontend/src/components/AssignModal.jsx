import { useState, useEffect } from 'react'
import { X, UserPlus, Building2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useTranslation } from 'react-i18next'

export default function AssignModal({ sessionId, currentAgentId, currentDepartmentId, onClose, onAssigned }) {
  const { t } = useTranslation('conversations')
  const [agents, setAgents] = useState([])
  const [departments, setDepartments] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(currentAgentId || '')
  const [selectedDeptId, setSelectedDeptId] = useState(currentDepartmentId || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const token = useAuthStore((s) => s.token)

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/agents', { headers }).then(r => r.json()),
      fetch('/api/departments', { headers }).then(r => r.json())
    ]).then(([agRes, dpRes]) => {
      setAgents(agRes.agents || [])
      setDepartments(dpRes.departments || [])
    }).catch(() => {})
  }, [])

  const handleAssign = async () => {
    setLoading(true)
    setError('')
    try {
      const body = { sessionId: Number(sessionId) }
      if (selectedAgentId) body.agentId = Number(selectedAgentId)
      if (selectedDeptId) body.departmentId = Number(selectedDeptId)

      const res = await fetch('/api/chat/assign', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || t('assignModal.errorAssigning'))
      onAssigned && onAssigned(data)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const agentsByDept = {}
  agents.filter(a => a.status === 'active').forEach(a => {
    const deptName = a.department_name || t('common:noDepartment')
    if (!agentsByDept[deptName]) agentsByDept[deptName] = []
    agentsByDept[deptName].push(a)
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-green-600" />
            {t('assignModal.title')}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm mb-4 border border-red-200">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Building2 className="w-4 h-4 inline mr-1" />
            {t('assignModal.department')}
          </label>
          <select
            value={selectedDeptId}
            onChange={e => setSelectedDeptId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
          >
            <option value="">{t('assignModal.noDepartment')}</option>
            {departments.filter(d => d.active).map(d => (
              <option key={d.id} value={d.id}>{d.display_name || d.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <UserPlus className="w-4 h-4 inline mr-1" />
            {t('assignModal.agent')}
          </label>
          <select
            value={selectedAgentId}
            onChange={e => setSelectedAgentId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
          >
            <option value="">{t('assignModal.noAgent')}</option>
            {Object.entries(agentsByDept).map(([deptName, deptAgents]) => (
              <optgroup key={deptName} label={deptName}>
                {deptAgents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.username}) - {a.role}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition"
          >
            {t('common:actions.cancel')}
          </button>
          <button
            onClick={handleAssign}
            disabled={loading || (!selectedAgentId && !selectedDeptId)}
            className="flex-1 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('assignModal.assigning') : t('assign')}
          </button>
        </div>
      </div>
    </div>
  )
}
