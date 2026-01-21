import { useState, useEffect } from 'react'
import { fetchLogs, fetchLogDetail, fetchLogStats } from '../api/logs'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Activity,
  CheckCircle,
  XCircle,
  ArrowRightLeft,
  Clock,
  ChevronRight,
  Filter,
  RefreshCw,
  Phone,
  MessageSquare,
  X
} from 'lucide-react'

const STATUS_CONFIG = {
  completed: { label: 'Completado', color: '#10b981', icon: CheckCircle },
  failed: { label: 'Fallido', color: '#ef4444', icon: XCircle },
  transferred: { label: 'Transferido', color: '#f59e0b', icon: ArrowRightLeft },
  running: { label: 'En progreso', color: '#3b82f6', icon: Activity },
  timeout: { label: 'Timeout', color: '#6b7280', icon: Clock }
}

export default function FlowLogs() {
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filters, setFilters] = useState({
    status: '',
    phone: '',
    flow_id: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [logsData, statsData] = await Promise.all([
        fetchLogs({ limit: 50, ...filters }),
        fetchLogStats(7)
      ])
      setLogs(logsData.logs || [])
      setStats(statsData.stats)
    } catch (err) {
      console.error('Error loading logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetail = async (log) => {
    setDetailLoading(true)
    try {
      const detail = await fetchLogDetail(log.id)
      setSelectedLog(detail.log)
    } catch (err) {
      console.error('Error loading log detail:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const applyFilters = () => {
    loadData()
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Logs de Ejecución</h1>
          <p className="text-gray-500 mt-1">Historial de ejecución de flujos</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">Total ejecuciones</p>
            <p className="text-2xl font-bold text-gray-800">{stats.total_executions || 0}</p>
            <p className="text-xs text-gray-400 mt-1">Últimos 7 días</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">Tasa de completado</p>
            <p className="text-2xl font-bold text-green-600">{stats.completion_rate || 0}%</p>
            <p className="text-xs text-gray-400 mt-1">{stats.completed || 0} completados</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">Fallidos</p>
            <p className="text-2xl font-bold text-red-500">{stats.failed || 0}</p>
            <p className="text-xs text-gray-400 mt-1">Requieren atención</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">Tiempo promedio</p>
            <p className="text-2xl font-bold text-blue-600">
              {stats.avg_duration_ms ? `${Math.round(stats.avg_duration_ms)}ms` : '-'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Por ejecución</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">Filtrar:</span>
          </div>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="completed">Completados</option>
            <option value="failed">Fallidos</option>
            <option value="transferred">Transferidos</option>
            <option value="running">En progreso</option>
          </select>
          <input
            type="text"
            value={filters.phone}
            onChange={(e) => handleFilterChange('phone', e.target.value)}
            placeholder="Teléfono..."
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none w-40"
          />
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm transition"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No hay logs de ejecución</p>
            <p className="text-sm mt-1">Los logs aparecerán cuando se ejecuten flujos</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Flujo</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Nodos</th>
                <th className="px-4 py-3">Duración</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => {
                const status = STATUS_CONFIG[log.status] || STATUS_CONFIG.running
                const StatusIcon = status.icon

                return (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm">
                      <div className="text-gray-800">
                        {format(new Date(log.started_at), 'dd/MM HH:mm')}
                      </div>
                      <div className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(log.started_at), {
                          addSuffix: true,
                          locale: es
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{log.flow_name || 'Sin nombre'}</div>
                      <div className="text-xs text-gray-400">{log.trigger_type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3 h-3 text-gray-400" />
                        <span className="text-sm text-gray-700">{log.phone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                        style={{ background: `${status.color}20`, color: status.color }}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {log.total_nodes_executed || 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {log.total_duration_ms ? `${Math.round(log.total_duration_ms)}ms` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleViewDetail(log)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                        title="Ver detalle"
                      >
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-auto m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-800">Detalle de Ejecución</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
              </div>
            ) : (
              <div className="p-4 space-y-6">
                {/* Info básica */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Flujo</p>
                    <p className="font-medium">{selectedLog.flow_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Teléfono</p>
                    <p className="font-medium">{selectedLog.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Mensaje trigger</p>
                    <p className="text-sm bg-gray-100 p-2 rounded">{selectedLog.trigger_message || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Estado final</p>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                      style={{
                        background: `${STATUS_CONFIG[selectedLog.status]?.color}20`,
                        color: STATUS_CONFIG[selectedLog.status]?.color
                      }}
                    >
                      {STATUS_CONFIG[selectedLog.status]?.label}
                    </span>
                  </div>
                </div>

                {/* Variables */}
                {selectedLog.variables && Object.keys(selectedLog.variables).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Variables capturadas</p>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                      {Object.entries(selectedLog.variables).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-purple-600">{key}:</span>
                          <span className="text-gray-700">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Steps */}
                {selectedLog.steps && selectedLog.steps.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Nodos ejecutados</p>
                    <div className="space-y-2">
                      {selectedLog.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-medium">
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{step.node_id}</span>
                              <span className="text-xs px-2 py-0.5 bg-gray-200 rounded text-gray-600">
                                {step.node_type}
                              </span>
                              <span className="text-xs text-gray-400">{step.duration_ms}ms</span>
                            </div>
                            {step.output && (
                              <p className="text-sm text-gray-600 mt-1 break-words">{step.output}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {selectedLog.error_message && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs text-red-600 font-medium mb-1">Error</p>
                    <p className="text-sm text-red-700">{selectedLog.error_message}</p>
                    {selectedLog.error_node_id && (
                      <p className="text-xs text-red-500 mt-1">En nodo: {selectedLog.error_node_id}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
