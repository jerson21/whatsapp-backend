import { useTranslation } from 'react-i18next'
import { useFlowStore } from '../store/flowStore'

const nodeTypes = [
  { type: 'trigger', labelKey: 'sidebar.trigger', icon: '⚡', color: '#667eea', descKey: 'sidebar.triggerDesc' },
  { type: 'message', labelKey: 'sidebar.message', icon: '💬', color: '#25D366', descKey: 'sidebar.messageDesc' },
  { type: 'question', labelKey: 'sidebar.question', icon: '❓', color: '#34B7F1', descKey: 'sidebar.questionDesc' },
  { type: 'condition', labelKey: 'sidebar.condition', icon: '🔀', color: '#f59e0b', descKey: 'sidebar.conditionDesc' },
  { type: 'action', labelKey: 'sidebar.action', icon: '⚙️', color: '#6366f1', descKey: 'sidebar.actionDesc' },
  { type: 'ai_response', labelKey: 'sidebar.aiResponse', icon: '🧠', color: '#8b5cf6', descKey: 'sidebar.aiResponseDesc' },
  { type: 'webhook', labelKey: 'sidebar.webhook', icon: '🌐', color: '#f97316', descKey: 'sidebar.webhookDesc' },
  { type: 'delay', labelKey: 'sidebar.delay', icon: '⏱️', color: '#64748b', descKey: 'sidebar.delayDesc' },
  { type: 'transfer', labelKey: 'sidebar.transfer', icon: '👤', color: '#ec4899', descKey: 'sidebar.transferDesc' },
  { type: 'end', labelKey: 'sidebar.end', icon: '🏁', color: '#ef4444', descKey: 'sidebar.endDesc' }
]

export default function Sidebar() {
  const { t } = useTranslation('flowBuilder')
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
        <span>☰</span> {t('sidebar.title')}
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
          {t('sidebar.title')}
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
        {t('sidebar.hint')}
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
              <div style={{ fontWeight: 500, fontSize: '13px' }}>{t(node.labelKey)}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>{t(node.descKey)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
