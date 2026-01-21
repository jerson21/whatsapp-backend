import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

const nodeStyles = {
  trigger: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none'
  },
  message: {
    background: 'white',
    border: '2px solid #25D366'
  },
  question: {
    background: 'white',
    border: '2px solid #34B7F1'
  },
  condition: {
    background: '#fef3c7',
    border: '2px solid #f59e0b'
  },
  action: {
    background: '#e0e7ff',
    border: '2px solid #6366f1'
  },
  transfer: {
    background: '#fce7f3',
    border: '2px solid #ec4899'
  },
  end: {
    background: '#fee2e2',
    border: '2px solid #ef4444'
  }
}

const nodeIcons = {
  trigger: '⚡',
  message: '💬',
  question: '❓',
  condition: '🔀',
  action: '⚙️',
  transfer: '👤',
  end: '🏁'
}

function BaseNode({ id, data, type, selected }) {
  const style = nodeStyles[type] || nodeStyles.message
  const icon = nodeIcons[type] || '📦'

  const showSourceHandle = type !== 'end'
  const showTargetHandle = type !== 'trigger'

  return (
    <div
      style={{
        ...style,
        padding: '12px 16px',
        borderRadius: '8px',
        minWidth: '180px',
        maxWidth: '250px',
        boxShadow: selected ? '0 0 0 2px #3b82f6' : '0 2px 8px rgba(0,0,0,0.1)',
        cursor: 'pointer'
      }}
    >
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: '#6b7280',
            width: 10,
            height: 10
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <strong style={{ fontSize: '13px' }}>{data.label || type}</strong>
      </div>

      {data.content && (
        <div style={{
          fontSize: '11px',
          opacity: 0.8,
          marginTop: '4px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {data.content.substring(0, 40)}{data.content.length > 40 ? '...' : ''}
        </div>
      )}

      {data.options && data.options.length > 0 && (
        <div style={{ fontSize: '10px', marginTop: '6px', opacity: 0.7 }}>
          {data.options.length} opciones
        </div>
      )}

      {showSourceHandle && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: '#25D366',
            width: 10,
            height: 10
          }}
        />
      )}
    </div>
  )
}

export default memo(BaseNode)
