import { useState } from 'react'
import { useFlowStore } from '../store/flowStore'
import { createFlow, updateFlow, activateFlow, fetchFlows, fetchFlow } from '../api/flows'

export default function Toolbar({ onTestClick }) {
  const {
    flowId,
    flowName,
    isActive,
    isSaved,
    exportFlow,
    markSaved,
    loadFlow,
    resetFlow,
    setFlowMeta
  } = useFlowStore()

  const [saving, setSaving] = useState(false)
  const [showFlowList, setShowFlowList] = useState(false)
  const [flows, setFlows] = useState([])
  const [flowNameInput, setFlowNameInput] = useState(flowName)

  const handleSave = async () => {
    setSaving(true)
    try {
      const flowData = exportFlow()
      flowData.name = flowNameInput

      if (flowId) {
        await updateFlow(flowId, flowData)
      } else {
        const result = await createFlow(flowData)
        setFlowMeta({ id: result.id, name: flowNameInput, slug: result.slug, is_active: false })
      }
      markSaved()
      alert('Flujo guardado correctamente')
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async () => {
    if (!flowId) {
      alert('Primero guarda el flujo')
      return
    }
    try {
      await activateFlow(flowId, !isActive)
      setFlowMeta({ id: flowId, name: flowNameInput, is_active: !isActive })
      alert(isActive ? 'Flujo desactivado' : 'Flujo activado')
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handleLoadFlows = async () => {
    try {
      const result = await fetchFlows()
      setFlows(result.flows || [])
      setShowFlowList(true)
    } catch (err) {
      alert('Error cargando flujos: ' + err.message)
    }
  }

  const handleSelectFlow = async (flow) => {
    try {
      const result = await fetchFlow(flow.id)
      loadFlow(result.flow)
      setFlowNameInput(result.flow.name)
      setShowFlowList(false)
    } catch (err) {
      alert('Error cargando flujo: ' + err.message)
    }
  }

  const handleNew = () => {
    if (!isSaved && !confirm('Tienes cambios sin guardar. ¿Continuar?')) {
      return
    }
    resetFlow()
    setFlowNameInput('Nuevo Flujo')
  }

  return (
    <div style={{
      height: '56px',
      background: 'white',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }}>
      {/* Left: Logo and flow name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>🤖</span>
          <span style={{ fontWeight: 600, color: '#075E54' }}>Flow Builder</span>
        </div>

        <div style={{ borderLeft: '1px solid #e5e7eb', height: '24px' }} />

        <input
          type="text"
          value={flowNameInput}
          onChange={(e) => setFlowNameInput(e.target.value)}
          style={{
            border: 'none',
            fontSize: '15px',
            fontWeight: 500,
            background: 'transparent',
            width: '200px'
          }}
          placeholder="Nombre del flujo"
        />

        {!isSaved && (
          <span style={{
            fontSize: '11px',
            background: '#fef3c7',
            color: '#92400e',
            padding: '2px 8px',
            borderRadius: '4px'
          }}>
            Sin guardar
          </span>
        )}

        {isActive && (
          <span style={{
            fontSize: '11px',
            background: '#d1fae5',
            color: '#065f46',
            padding: '2px 8px',
            borderRadius: '4px'
          }}>
            Activo
          </span>
        )}
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onTestClick}
          style={{
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500
          }}
        >
          🧪 Probar
        </button>

        <div style={{ borderLeft: '1px solid #e5e7eb', height: '24px', margin: '0 4px' }} />

        <button
          onClick={handleNew}
          style={{
            padding: '8px 16px',
            background: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          + Nuevo
        </button>

        <button
          onClick={handleLoadFlows}
          style={{
            padding: '8px 16px',
            background: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          📂 Abrir
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 16px',
            background: '#25D366',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: saving ? 'wait' : 'pointer',
            fontSize: '13px',
            fontWeight: 500
          }}
        >
          {saving ? 'Guardando...' : '💾 Guardar'}
        </button>

        {flowId && (
          <button
            onClick={handleToggleActive}
            style={{
              padding: '8px 16px',
              background: isActive ? '#fee2e2' : '#d1fae5',
              color: isActive ? '#dc2626' : '#065f46',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            {isActive ? '⏸️ Desactivar' : '▶️ Activar'}
          </button>
        )}
      </div>

      {/* Flow list modal */}
      {showFlowList && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '400px',
            maxHeight: '500px',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Seleccionar flujo</h3>
              <button onClick={() => setShowFlowList(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✕</button>
            </div>

            {flows.length === 0 ? (
              <p style={{ color: '#6b7280', textAlign: 'center' }}>No hay flujos guardados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {flows.map(flow => (
                  <div
                    key={flow.id}
                    onClick={() => handleSelectFlow(flow)}
                    style={{
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{flow.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{flow.slug}</div>
                    </div>
                    {flow.is_active && (
                      <span style={{
                        fontSize: '10px',
                        background: '#d1fae5',
                        color: '#065f46',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        Activo
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
