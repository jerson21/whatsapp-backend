import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { Plus, Edit, Trash2, Tag } from 'lucide-react'

const getHeaders = () => {
  const token = useAuthStore.getState().token
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingDept, setEditingDept] = useState(null)
  const [form, setForm] = useState({ name: '', displayName: '', icon: 'MessageSquare', color: '#6f42c1', autoAssignIntents: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    try {
      const res = await fetch('/api/departments', { headers: getHeaders() })
      const data = await res.json()
      if (data.ok) setDepartments(data.departments)
    } catch (e) {
      console.error('Error loading departments:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openCreate = () => {
    setEditingDept(null)
    setForm({ name: '', displayName: '', icon: 'MessageSquare', color: '#6f42c1', autoAssignIntents: '' })
    setError('')
    setShowModal(true)
  }

  const openEdit = (dept) => {
    setEditingDept(dept)
    const intents = dept.auto_assign_intents
    const intentsStr = Array.isArray(intents) ? intents.join(', ') : (typeof intents === 'string' ? JSON.parse(intents || '[]').join(', ') : '')
    setForm({
      name: dept.name,
      displayName: dept.display_name,
      icon: dept.icon || 'MessageSquare',
      color: dept.color || '#6f42c1',
      autoAssignIntents: intentsStr
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const intentsArray = form.autoAssignIntents
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)

      if (editingDept) {
        const res = await fetch(`/api/departments/${editingDept.id}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            displayName: form.displayName,
            icon: form.icon,
            color: form.color,
            autoAssignIntents: intentsArray
          })
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error)
      } else {
        const res = await fetch('/api/departments', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            name: form.name.toLowerCase().replace(/\s+/g, '_'),
            displayName: form.displayName,
            icon: form.icon,
            color: form.color,
            autoAssignIntents: intentsArray
          })
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

  const handleDelete = async (dept) => {
    if (!confirm(`Desactivar departamento "${dept.display_name}"?`)) return
    try {
      const res = await fetch(`/api/departments/${dept.id}`, { method: 'DELETE', headers: getHeaders() })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      loadData()
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  const COLORS = ['#28a745', '#17a2b8', '#ffc107', '#6f42c1', '#dc3545', '#fd7e14', '#20c997', '#6610f2', '#e83e8c', '#007bff']
  const ICONS = ['MessageSquare', 'ShoppingCart', 'Wrench', 'Package', 'Phone', 'Mail', 'Star', 'Heart', 'Zap', 'Globe']

  if (loading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full"></div></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departamentos</h1>
          <p className="text-gray-500 text-sm mt-1">Organiza los agentes por area</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg transition font-medium">
          <Plus className="w-4 h-4" /> Nuevo Departamento
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map(dept => {
          const intents = Array.isArray(dept.auto_assign_intents)
            ? dept.auto_assign_intents
            : JSON.parse(dept.auto_assign_intents || '[]')

          return (
            <div key={dept.id} className={`bg-white rounded-xl border-2 p-5 ${dept.active ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${dept.color}20` }}>
                    <span className="text-lg" style={{ color: dept.color }}>
                      {dept.icon === 'ShoppingCart' ? '🛒' : dept.icon === 'Wrench' ? '🔧' : dept.icon === 'Package' ? '📦' : '💬'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{dept.display_name}</h3>
                    <p className="text-xs text-gray-400">@{dept.name}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(dept)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Edit className="w-4 h-4" />
                  </button>
                  {dept.name !== 'general' && dept.active && (
                    <button onClick={() => handleDelete(dept)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">{dept.agent_count || 0} agentes</span>
                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                <span className={`text-xs ${dept.active ? 'text-green-600' : 'text-gray-400'}`}>
                  {dept.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              {intents.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Intents auto-asignados:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {intents.map((intent, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {intent}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingDept ? 'Editar Departamento' : 'Nuevo Departamento'}
            </h2>

            {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>}

            <form onSubmit={handleSave} className="space-y-4">
              {!editingDept && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Identificador (slug)</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required
                    placeholder="ej: ventas, soporte" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre visible</label>
                <input type="text" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required
                  placeholder="ej: Ventas, Soporte Tecnico" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded-full transition ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icono</label>
                <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {ICONS.map(icon => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Intents para auto-asignacion
                </label>
                <input type="text" value={form.autoAssignIntents}
                  onChange={e => setForm({ ...form, autoAssignIntents: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="ventas, comprar, precio (separados por coma)" />
                <p className="text-xs text-gray-400 mt-1">
                  Cuando el chatbot detecta estos intents, asigna automaticamente a este departamento.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50">
                  {saving ? 'Guardando...' : (editingDept ? 'Guardar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
