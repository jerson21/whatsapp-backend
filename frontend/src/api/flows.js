const API_BASE = '/api/visual-flows-live'

async function handleResponse(res, errorMsg) {
  if (!res.ok) {
    let message = errorMsg
    try {
      const data = await res.json()
      if (data.error) message = data.error
    } catch (e) {
      // JSON parse failed, use default message
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchFlows() {
  const res = await fetch(API_BASE)
  return handleResponse(res, 'Error al cargar flujos')
}

export async function fetchFlow(idOrSlug) {
  const res = await fetch(`${API_BASE}/${idOrSlug}`)
  return handleResponse(res, 'Flujo no encontrado')
}

export async function createFlow(flowData) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(flowData)
  })
  return handleResponse(res, 'Error al crear flujo')
}

export async function updateFlow(idOrSlug, flowData) {
  const res = await fetch(`${API_BASE}/${idOrSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(flowData)
  })
  return handleResponse(res, 'Error al actualizar flujo')
}

export async function deleteFlow(idOrSlug) {
  const res = await fetch(`${API_BASE}/${idOrSlug}`, {
    method: 'DELETE'
  })
  return handleResponse(res, 'Error al eliminar flujo')
}

export async function activateFlow(idOrSlug, active = true) {
  const res = await fetch(`${API_BASE}/${idOrSlug}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active })
  })
  return handleResponse(res, 'Error al activar flujo')
}

export async function duplicateFlow(idOrSlug, newName) {
  const res = await fetch(`${API_BASE}/${idOrSlug}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: newName })
  })
  return handleResponse(res, 'Error al duplicar flujo')
}

export async function testFlow(idOrSlug, message, context = {}) {
  const res = await fetch(`${API_BASE}/${idOrSlug}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context })
  })
  return handleResponse(res, 'Error al probar flujo')
}

export async function simulateFlowMessage(flowData, message, sessionState = null) {
  const res = await fetch(`${API_BASE}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow: flowData, message, sessionState })
  })
  return handleResponse(res, 'Error en simulación')
}

export async function fetchTemplates() {
  const res = await fetch(`${API_BASE}/templates/list`)
  return handleResponse(res, 'Error al cargar plantillas')
}

export async function createFromTemplate(templateId, name) {
  const res = await fetch(`${API_BASE}/templates/${templateId}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  return handleResponse(res, 'Error al crear desde plantilla')
}

// ============================================
// PLANTILLAS DE META (WhatsApp Business)
// ============================================

export async function fetchMetaTemplates(filters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.append('status', filters.status)
  if (filters.category) params.append('category', filters.category)
  if (filters.lang) params.append('lang', filters.lang)
  params.append('with', 'components')
  params.append('limit', '200')

  const res = await fetch(`/api/chat/templates?${params}`)
  return handleResponse(res, 'Error al cargar plantillas de Meta')
}

export async function testMetaTemplate({ templateName, languageCode, phone, parameters = [], headerParams = [], buttonParams = [] }) {
  const res = await fetch('/api/templates/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateName, languageCode, phone, parameters, headerParams, buttonParams })
  })
  return handleResponse(res, 'Error al enviar plantilla de prueba')
}

// ============================================
// TOGGLE GLOBAL DE VISUAL FLOWS
// ============================================

export async function getVisualFlowsStatus() {
  const res = await fetch('/api/settings/visual-flows')
  return handleResponse(res, 'Error al obtener estado de Visual Flows')
}

export async function setVisualFlowsStatus(enabled) {
  const res = await fetch('/api/settings/visual-flows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  })
  return handleResponse(res, 'Error al cambiar estado de Visual Flows')
}
