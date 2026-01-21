import { useFlowStore } from '../store/flowStore'

const nodeTypes = [
  { type: 'trigger', label: 'Trigger', icon: '⚡', color: '#667eea', description: 'Inicio del flujo' },
  { type: 'message', label: 'Mensaje', icon: '💬', color: '#25D366', description: 'Enviar mensaje' },
  { type: 'question', label: 'Pregunta', icon: '❓', color: '#34B7F1', description: 'Preguntar y esperar' },
  { type: 'condition', label: 'Condición', icon: '🔀', color: '#f59e0b', description: 'Bifurcación' },
  { type: 'action', label: 'Acción', icon: '⚙️', color: '#6366f1', description: 'Ejecutar acción' },
  { type: 'ai_response', label: 'Respuesta IA', icon: '🧠', color: '#8b5cf6', description: 'Generar con IA' },
  { type: 'webhook', label: 'Webhook', icon: '🌐', color: '#f97316', description: 'Llamar API externa' },
  { type: 'delay', label: 'Espera', icon: '⏱️', color: '#64748b', description: 'Pausar X segundos' },
  { type: 'transfer', label: 'Transferir', icon: '👤', color: '#ec4899', description: 'Pasar a humano' },
  { type: 'end', label: 'Fin', icon: '🏁', color: '#ef4444', description: 'Terminar flujo' }
]

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useFlowStore()

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  if (!isSidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        style={{
          position: 'absolute',
          left: 10,
          top: 10,
          zIndex: 10,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <span>☰</span> Nodos
      </button>
    )
  }

  return (
    <div style={{
      width: '240px',
      background: 'white',
      borderRight: '1px solid #e5e7eb',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          Nodos
        </h3>
        <button
          onClick={toggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#6b7280'
          }}
        >
          ✕
        </button>
      </div>

      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
        Arrastra los nodos al canvas para construir tu flujo
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {nodeTypes.map(node => (
          <div
            key={node.type}
            draggable
            onDragStart={(e) => onDragStart(e, node.type)}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: `${node.color}15`,
              border: `1px solid ${node.color}30`,
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateX(4px)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{ fontSize: '20px' }}>{node.icon}</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: '13px' }}>{node.label}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>{node.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
