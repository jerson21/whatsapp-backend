import { useState, useEffect } from 'react'
import { testMetaTemplate } from '../api/flows'

const STORAGE_KEY = 'whatsapp_test_phone'

export default function TemplateTestModal({ template, onClose }) {
  const [phone, setPhone] = useState('')
  const [rememberPhone, setRememberPhone] = useState(true)
  const [parameters, setParameters] = useState([])
  const [headerParams, setHeaderParams] = useState([])
  const [buttonParams, setButtonParams] = useState([])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  // Cargar teléfono guardado
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setPhone(saved)
  }, [])

  // Extraer parámetros de la plantilla
  useEffect(() => {
    if (!template?.components) return

    const bodyComp = template.components.find(c => c.type === 'BODY')
    const headerComp = template.components.find(c => c.type === 'HEADER')
    const buttonComps = template.components.filter(c => c.type === 'BUTTONS')

    // Extraer variables del body {{1}}, {{2}}, etc.
    if (bodyComp?.text) {
      const matches = bodyComp.text.match(/\{\{(\d+)\}\}/g) || []
      setParameters(matches.map(() => ''))
    }

    // Extraer variables del header
    if (headerComp?.text) {
      const matches = headerComp.text.match(/\{\{(\d+)\}\}/g) || []
      setHeaderParams(matches.map(() => ''))
    }

    // Extraer URLs dinámicas de botones
    if (buttonComps.length > 0) {
      const urlButtons = []
      buttonComps.forEach(bc => {
        if (bc.buttons) {
          bc.buttons.forEach(btn => {
            if (btn.type === 'URL' && btn.url?.includes('{{')) {
              urlButtons.push('')
            }
          })
        }
      })
      setButtonParams(urlButtons)
    }
  }, [template])

  const handleSend = async () => {
    if (!phone.trim()) {
      setResult({ ok: false, error: 'Ingresa un número de teléfono' })
      return
    }

    setSending(true)
    setResult(null)

    try {
      if (rememberPhone) {
        localStorage.setItem(STORAGE_KEY, phone)
      }

      const res = await testMetaTemplate({
        templateName: template.name,
        languageCode: template.language,
        phone: phone.trim(),
        parameters: parameters.filter(p => p !== ''),
        headerParams: headerParams.filter(p => p !== ''),
        buttonParams: buttonParams.filter(p => p !== '')
      })

      setResult(res)
    } catch (err) {
      setResult({ ok: false, error: err.message })
    } finally {
      setSending(false)
    }
  }

  const getPreviewText = () => {
    if (!template?.components) return ''
    const bodyComp = template.components.find(c => c.type === 'BODY')
    if (!bodyComp?.text) return ''

    let text = bodyComp.text
    parameters.forEach((param, idx) => {
      text = text.replace(`{{${idx + 1}}}`, param || `[param ${idx + 1}]`)
    })
    return text
  }

  const statusColors = {
    APPROVED: { bg: '#dcfce7', text: '#166534' },
    PENDING: { bg: '#fef3c7', text: '#92400e' },
    REJECTED: { bg: '#fee2e2', text: '#991b1b' }
  }

  const categoryColors = {
    MARKETING: { bg: '#dbeafe', text: '#1e40af' },
    UTILITY: { bg: '#f3e8ff', text: '#6b21a8' },
    AUTHENTICATION: { bg: '#fce7f3', text: '#9d174d' }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '20px' }}>
              Probar Plantilla
            </h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                background: statusColors[template.status]?.bg || '#f3f4f6',
                color: statusColors[template.status]?.text || '#374151'
              }}>
                {template.status}
              </span>
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                background: categoryColors[template.category]?.bg || '#f3f4f6',
                color: categoryColors[template.category]?.text || '#374151'
              }}>
                {template.category}
              </span>
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                background: '#f3f4f6',
                color: '#374151'
              }}>
                {template.language}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        {/* Nombre de la plantilla */}
        <div style={{
          background: '#f9fafb',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
            Nombre de la plantilla
          </div>
          <div style={{ fontFamily: 'monospace', fontWeight: '500' }}>
            {template.name}
          </div>
        </div>

        {/* Preview del mensaje */}
        <div style={{
          background: '#dcf8c6',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px',
          whiteSpace: 'pre-wrap'
        }}>
          <div style={{ fontSize: '12px', color: '#075e54', marginBottom: '4px' }}>
            Vista previa
          </div>
          <div style={{ color: '#000' }}>
            {getPreviewText() || '(Sin contenido)'}
          </div>
        </div>

        {/* Parámetros del body */}
        {parameters.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              Parámetros del mensaje
            </div>
            {parameters.map((param, idx) => (
              <input
                key={`body-${idx}`}
                type="text"
                placeholder={`Parámetro {{${idx + 1}}}`}
                value={param}
                onChange={(e) => {
                  const newParams = [...parameters]
                  newParams[idx] = e.target.value
                  setParameters(newParams)
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  fontSize: '14px'
                }}
              />
            ))}
          </div>
        )}

        {/* Parámetros del header */}
        {headerParams.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              Parámetros del encabezado
            </div>
            {headerParams.map((param, idx) => (
              <input
                key={`header-${idx}`}
                type="text"
                placeholder={`Header {{${idx + 1}}}`}
                value={param}
                onChange={(e) => {
                  const newParams = [...headerParams]
                  newParams[idx] = e.target.value
                  setHeaderParams(newParams)
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  fontSize: '14px'
                }}
              />
            ))}
          </div>
        )}

        {/* Parámetros de botones URL */}
        {buttonParams.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              Parámetros de botón URL
            </div>
            {buttonParams.map((param, idx) => (
              <input
                key={`btn-${idx}`}
                type="text"
                placeholder={`Texto dinámico del botón ${idx + 1}`}
                value={param}
                onChange={(e) => {
                  const newParams = [...buttonParams]
                  newParams[idx] = e.target.value
                  setButtonParams(newParams)
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  fontSize: '14px'
                }}
              />
            ))}
          </div>
        )}

        {/* Teléfono destino */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
            Número de teléfono destino
          </div>
          <input
            type="tel"
            placeholder="56912345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
            fontSize: '13px',
            color: '#6b7280',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={rememberPhone}
              onChange={(e) => setRememberPhone(e.target.checked)}
            />
            Recordar este número
          </label>
        </div>

        {/* Resultado */}
        {result && (
          <div style={{
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
            background: result.ok ? '#dcfce7' : '#fee2e2',
            color: result.ok ? '#166534' : '#991b1b'
          }}>
            {result.ok ? (
              <>
                <div style={{ fontWeight: '500' }}>Enviado correctamente</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>
                  Mensaje enviado a {result.sentTo}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: '500' }}>Error al enviar</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>
                  {result.error}
                </div>
              </>
            )}
          </div>
        )}

        {/* Botones */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cerrar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || template.status !== 'APPROVED'}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              background: template.status === 'APPROVED' ? '#25d366' : '#9ca3af',
              color: 'white',
              cursor: template.status === 'APPROVED' ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {sending ? 'Enviando...' : 'Enviar Prueba'}
          </button>
        </div>

        {template.status !== 'APPROVED' && (
          <div style={{
            marginTop: '12px',
            padding: '8px',
            background: '#fef3c7',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#92400e',
            textAlign: 'center'
          }}>
            Solo se pueden probar plantillas con estado APPROVED
          </div>
        )}
      </div>
    </div>
  )
}
