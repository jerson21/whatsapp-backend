const API_BASE = '/api/flow-analytics'

async function handleResponse(res, errorMsg) {
  if (!res.ok) {
    let message = errorMsg
    try {
      const data = await res.json()
      if (data.error) message = data.error
    } catch (e) {
      // JSON parse failed
    }
    throw new Error(message)
  }
  return res.json()
}

export async function fetchAnalyticsSummary(days = 7) {
  const res = await fetch(`${API_BASE}/summary?days=${days}`)
  return handleResponse(res, 'Error al cargar resumen')
}

export async function fetchTimeline(days = 14) {
  const res = await fetch(`${API_BASE}/timeline?days=${days}`)
  return handleResponse(res, 'Error al cargar timeline')
}

export async function fetchByFlow(days = 7) {
  const res = await fetch(`${API_BASE}/by-flow?days=${days}`)
  return handleResponse(res, 'Error al cargar métricas por flujo')
}

export async function fetchByHour(days = 7) {
  const res = await fetch(`${API_BASE}/by-hour?days=${days}`)
  return handleResponse(res, 'Error al cargar distribución horaria')
}

export async function fetchTriggerTypes(days = 7) {
  const res = await fetch(`${API_BASE}/trigger-types?days=${days}`)
  return handleResponse(res, 'Error al cargar tipos de trigger')
}
