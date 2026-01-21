const API_BASE = '/api/leads'

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

export async function fetchLeads(params = {}) {
  const queryString = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}?${queryString}`)
  return handleResponse(res, 'Error al cargar leads')
}

export async function fetchLeadStats() {
  const res = await fetch(`${API_BASE}/stats`)
  return handleResponse(res, 'Error al cargar estadísticas')
}

export async function fetchLeadProfile(phone) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(phone)}`)
  return handleResponse(res, 'Lead no encontrado')
}

export async function updateLead(phone, data) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(phone)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return handleResponse(res, 'Error al actualizar lead')
}

export async function adjustLeadScore(phone, adjustment, reason) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(phone)}/adjust-score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adjustment, reason })
  })
  return handleResponse(res, 'Error al ajustar score')
}

export async function deleteLead(phone) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(phone)}`, {
    method: 'DELETE'
  })
  return handleResponse(res, 'Error al eliminar lead')
}
