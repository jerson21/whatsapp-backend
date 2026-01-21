import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchFlows, fetchTemplates, createFromTemplate, activateFlow, deleteFlow, duplicateFlow } from '../api/flows'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function FlowsManager() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('flows') // 'flows' or 'templates'
  const [flows, setFlows] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [flowsData, templatesData] = await Promise.all([
        fetchFlows(),
        fetchTemplates()
      ])

      setFlows(flowsData.flows || [])
      setTemplates(templatesData.templates || [])
    } catch (err) {
      console.error('Error loading flows:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const handleCreateFromTemplate = async (templateId, templateName) => {
    try {
      const result = await createFromTemplate(templateId, null)
      showNotification(`Flujo "${templateName}" creado correctamente`, 'success')
      await loadData()

      // Navigate to FlowBuilder to edit the new flow
      if (result.id) {
        navigate(`/flows/builder/${result.id}`)
      }
    } catch (err) {
      console.error('Error creating from template:', err)
      showNotification(`Error al crear flujo: ${err.message}`, 'error')
    }
  }

  const handleToggleActive = async (flow) => {
    try {
      const newActiveState = !flow.is_active
      await activateFlow(flow.id, newActiveState)
      showNotification(
        `Flujo "${flow.name}" ${newActiveState ? 'activado' : 'desactivado'}`,
        'success'
      )
      await loadData()
    } catch (err) {
      console.error('Error toggling flow:', err)
      showNotification(`Error: ${err.message}`, 'error')
    }
  }

  const handleDuplicate = async (flow) => {
    try {
      await duplicateFlow(flow.id, `${flow.name} (copia)`)
      showNotification(`Flujo duplicado correctamente`, 'success')
      await loadData()
    } catch (err) {
      console.error('Error duplicating flow:', err)
      showNotification(`Error al duplicar: ${err.message}`, 'error')
    }
  }

  const handleDelete = async (flow) => {
    if (!confirm(`¿Estás seguro de eliminar el flujo "${flow.name}"?`)) {
      return
    }

    try {
      await deleteFlow(flow.id)
      showNotification(`Flujo eliminado correctamente`, 'success')
      await loadData()
    } catch (err) {
      console.error('Error deleting flow:', err)
      showNotification(`Error al eliminar: ${err.message}`, 'error')
    }
  }

  const getCategoryBadgeColor = (category) => {
    const colors = {
      sales: 'bg-green-100 text-green-800',
      support: 'bg-blue-100 text-blue-800',
      service: 'bg-purple-100 text-purple-800',
      feedback: 'bg-yellow-100 text-yellow-800',
      engagement: 'bg-pink-100 text-pink-800'
    }
    return colors[category] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando flujos...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold mb-2">Error al cargar flujos</h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestión de Flujos</h1>
        <p className="text-gray-600">
          Administra tus flujos conversacionales y crea nuevos desde plantillas predefinidas
        </p>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`mb-4 p-4 rounded-lg ${
          notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
          notification.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
          'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('flows')}
            className={`pb-4 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'flows'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Mis Flujos ({flows.length})
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-4 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'templates'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Plantillas ({templates.length})
          </button>
        </div>
      </div>

      {/* My Flows Tab */}
      {activeTab === 'flows' && (
        <div>
          {flows.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No tienes flujos creados</h3>
              <p className="mt-1 text-sm text-gray-500">
                Comienza creando un flujo desde una plantilla
              </p>
              <div className="mt-6">
                <button
                  onClick={() => setActiveTab('templates')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Ver Plantillas
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estadísticas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Última actualización
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {flows.map((flow) => (
                    <tr key={flow.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {flow.name}
                              {flow.is_default && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  Por defecto
                                </span>
                              )}
                            </div>
                            {flow.description && (
                              <div className="text-sm text-gray-500">{flow.description}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleActive(flow)}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                            flow.is_active
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                          }`}
                        >
                          {flow.is_active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-col space-y-1">
                          <span>Ejecutado: {flow.times_triggered || 0} veces</span>
                          <span>Completado: {flow.times_completed || 0} veces</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {flow.updated_at
                          ? format(new Date(flow.updated_at), 'dd MMM yyyy, HH:mm', { locale: es })
                          : '-'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => navigate(`/flows/builder/${flow.id}`)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDuplicate(flow)}
                            className="text-gray-600 hover:text-gray-900"
                            title="Duplicar"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(flow)}
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-gray-200"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {template.name}
                  </h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryBadgeColor(template.category)}`}>
                    {template.category}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {template.description}
                </p>

                <div className="flex items-center text-sm text-gray-500 mb-4">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  <span>{template.nodes_count} nodos</span>
                </div>

                {template.features && template.features.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {template.features.map((feature) => (
                      <span
                        key={feature}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => handleCreateFromTemplate(template.id, template.name)}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Crear desde esta plantilla
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
