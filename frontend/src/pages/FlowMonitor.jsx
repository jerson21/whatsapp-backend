import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, Phone, Clock, CheckCircle, XCircle, User } from 'lucide-react'

export default function FlowMonitor() {
  const { t } = useTranslation('monitor')
  const [executions, setExecutions] = useState([])
  const [selectedExecution, setSelectedExecution] = useState(null)
  const [stats, setStats] = useState({ running: 0, connectedMonitors: 0 })
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Conectar a SSE
    const eventSource = new EventSource('/api/flow-monitor/stream')

    eventSource.onopen = () => setIsConnected(true)

    eventSource.onerror = () => setIsConnected(false)

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'connected':
          // Conexión establecida
          setStats({ running: data.activeCount, connectedMonitors: 0 })
          break
        case 'active_execution':
          // Ejecución activa ya existente
          setExecutions(prev => {
            const exists = prev.find(e => e.executionId === data.executionId)
            if (exists) return prev
            return [data, ...prev]
          })
          break
        case 'flow_started':
          // Agregar nueva ejecución
          setExecutions(prev => [data, ...prev])
          break
        case 'node_started':
        case 'node_completed':
          // Actualizar ejecución existente
          setExecutions(prev => prev.map(exec =>
            exec.executionId === data.executionId
              ? {
                  ...exec,
                  currentNodeId: data.nodeId,
                  currentNodeType: data.nodeType,
                  variables: data.variables,
                  steps: data.type === 'node_completed'
                    ? [...(exec.steps || []), {
                        nodeId: data.nodeId,
                        nodeType: data.nodeType,
                        durationMs: data.durationMs,
                        status: data.status,
                        timestamp: data.timestamp
                      }]
                    : exec.steps
                }
              : exec
          ))
          break
        case 'flow_completed':
        case 'flow_error':
        case 'flow_transferred':
          // Marcar como completado
          setExecutions(prev => prev.map(exec =>
            exec.executionId === data.executionId
              ? {
                  ...exec,
                  status: data.type.replace('flow_', ''),
                  completedAt: data.timestamp
                }
              : exec
          ))
          break
      }
    }

    return () => eventSource.close()
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{t('title')}</h1>
            <p className="text-gray-500">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">
                {isConnected ? t('connected') : t('disconnected')}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              {t('activeExecutions', { count: executions.filter(e => !e.status).length })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel Izquierdo: Ejecuciones */}
        <aside className="w-80 bg-white border-r overflow-y-auto">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-700">{t('executions')}</h2>
          </div>
          <div className="divide-y">
            {executions.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                {t('noExecutions')}
              </div>
            ) : (
              executions.map((exec) => (
                <button
                  key={exec.executionId}
                  onClick={() => setSelectedExecution(exec)}
                  className={`w-full p-4 text-left hover:bg-gray-50 transition ${
                    selectedExecution?.executionId === exec.executionId ? 'bg-green-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="font-mono text-sm text-gray-700 truncate">
                          {exec.phone}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mb-1">
                        {exec.flowName || exec.flowSlug}
                      </p>
                      {exec.currentNodeId && (
                        <div className="flex items-center gap-1 text-xs">
                          <Activity className="w-3 h-3 text-green-500" />
                          <span className="text-gray-600">{exec.currentNodeId}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      {exec.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                      {exec.status === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
                      {exec.status === 'transferred' && <User className="w-5 h-5 text-yellow-500" />}
                      {!exec.status && <Activity className="w-5 h-5 text-green-500 animate-pulse" />}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Panel Central y Derecho */}
        <main className="flex-1 flex">
          {selectedExecution ? (
            <>
              {/* Panel Central: Flujo (simplificado en v1) */}
              <div className="flex-1 p-6 overflow-auto">
                <div className="bg-white rounded-lg border p-6">
                  <h3 className="font-semibold text-gray-700 mb-4">{t('flowExecution')}</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm text-gray-500">{t('flow')}</span>
                      <p className="font-medium">{selectedExecution.flowName}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">{t('phone')}</span>
                      <p className="font-mono text-sm">{selectedExecution.phone}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">{t('currentNode')}</span>
                      <p className="font-mono text-sm">{selectedExecution.currentNodeId || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">{t('nodeType')}</span>
                      <p className="font-mono text-sm">{selectedExecution.currentNodeType || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">{t('status')}</span>
                      <p className="font-medium">
                        {selectedExecution.status === 'completed' && t('statusCompleted')}
                        {selectedExecution.status === 'error' && t('statusError')}
                        {selectedExecution.status === 'transferred' && t('statusTransferred')}
                        {!selectedExecution.status && t('statusRunning')}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">{t('started')}</span>
                      <p className="text-sm">
                        {selectedExecution.timestamp ? new Date(selectedExecution.timestamp).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                    {selectedExecution.completedAt && (
                      <div>
                        <span className="text-sm text-gray-500">{t('completedAt')}</span>
                        <p className="text-sm">
                          {new Date(selectedExecution.completedAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Panel Derecho: Detalles */}
              <aside className="w-96 bg-white border-l overflow-y-auto">
                <div className="p-4 border-b">
                  <h2 className="font-semibold text-gray-700">{t('details')}</h2>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">{t('variables')}</h3>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs">
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedExecution.variables || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">{t('timeline')}</h3>
                    <div className="space-y-2">
                      {selectedExecution.steps && selectedExecution.steps.length > 0 ? (
                        selectedExecution.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium text-gray-700">{step.nodeId}</p>
                              <p className="text-gray-500">{step.nodeType} • {step.durationMs}ms</p>
                              {step.timestamp && (
                                <p className="text-gray-400">
                                  {new Date(step.timestamp).toLocaleTimeString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-400 text-sm">{t('noEventsYet')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </aside>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('selectExecution')}</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
