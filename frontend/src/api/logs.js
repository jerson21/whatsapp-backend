const API_BASE = '/api/flow-logs'

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

export async function fetchLogs(params = {}) {
  const queryString = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}?${queryString}`)
  return handleResponse(res, 'Error al cargar logs')
}

export async function fetchLogDetail(id) {
  const res = await fetch(`${API_BASE}/${id}`)
  return handleResponse(res, 'Log no encontrado')
}

export async function fetchLogStats(days = 7) {
  const res = await fetch(`${API_BASE}/stats/summary?days=${days}`)
  return handleResponse(res, 'Error al cargar estadísticas')
}

export async function deleteLog(id) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE'
  })
  return handleResponse(res, 'Error al eliminar log')
}

export async function cleanOldLogs(olderThanDays = 30) {
  const res = await fetch(`${API_BASE}?older_than_days=${olderThanDays}`, {
    method: 'DELETE'
  })
  return handleResponse(res, 'Error al limpiar logs')
}
