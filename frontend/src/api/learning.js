import { useAuthStore } from '../store/authStore'

const API_BASE = '/api/learning'

const getHeaders = () => {
  const token = useAuthStore.getState().token
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

async function handleResponse(res) {
  const data = await res.json()
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Error en la solicitud')
  }
  return data
}

// === STATS ===
export async function fetchLearningStats() {
  const res = await fetch(`${API_BASE}/stats`, { headers: getHeaders() })
  return handleResponse(res)
}

// === PARES Q&A ===
export async function fetchPairs(params = {}) {
  const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  const qs = new URLSearchParams(filtered).toString()
  const res = await fetch(`${API_BASE}/pairs${qs ? '?' + qs : ''}`, { headers: getHeaders() })
  return handleResponse(res)
}

export async function updatePairStatus(id, status) {
  const res = await fetch(`${API_BASE}/pairs/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ status })
  })
  return handleResponse(res)
}

export async function deletePair(id) {
  const res = await fetch(`${API_BASE}/pairs/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse(res)
}

export async function reprocessSessions(from, to) {
  const res = await fetch(`${API_BASE}/reprocess`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ from: from || undefined, to: to || undefined })
  })
  return handleResponse(res)
}

// === PRECIOS ===
export async function fetchPrices(active = true) {
  const res = await fetch(`${API_BASE}/prices?active=${active}`, { headers: getHeaders() })
  return handleResponse(res)
}

export async function createPrice(data) {
  const res = await fetch(`${API_BASE}/prices`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse(res)
}

export async function updatePrice(id, data) {
  const res = await fetch(`${API_BASE}/prices/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse(res)
}

export async function deletePrice(id) {
  const res = await fetch(`${API_BASE}/prices/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse(res)
}

// === BRAIN REPORT ===
export async function fetchBrainReport(force = false) {
  const res = await fetch(`${API_BASE}/brain-report${force ? '?force=true' : ''}`, {
    headers: getHeaders()
  })
  return handleResponse(res)
}

// === CHATBOT CONFIG (instrucciones personalizadas) ===
export async function fetchChatbotConfig() {
  const res = await fetch('/api/chatbot/config', { headers: getHeaders() })
  return handleResponse(res)
}

export async function updateChatbotConfig(data) {
  const res = await fetch('/api/chatbot/config', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse(res)
}

// === CURRENT PROMPT ===
export async function fetchCurrentPrompt(phone = null) {
  const qs = phone ? `?phone=${encodeURIComponent(phone)}` : ''
  const res = await fetch(`/api/chatbot/current-prompt${qs}`, { headers: getHeaders() })
  return handleResponse(res)
}

// === BOT CONVERSATIONS ===
export async function fetchBotConversations(limit = 50, offset = 0) {
  const res = await fetch(`/api/chat/bot-conversations?limit=${limit}&offset=${offset}`, {
    headers: getHeaders()
  })
  return handleResponse(res)
}

export async function fetchBotConversationMessages(sessionId) {
  const res = await fetch(`/api/chat/bot-conversations/${sessionId}/messages`, {
    headers: getHeaders()
  })
  return handleResponse(res)
}

export async function correctBotMessage(sessionId, messageId, correctedAnswer) {
  const res = await fetch(`/api/chat/bot-conversations/${sessionId}/correct`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ messageId, correctedAnswer })
  })
  return handleResponse(res)
}

// === SIMULADOR DE CHAT ===
export async function simulateChatMessage(phone, message) {
  const res = await fetch('/api/chat/simulate', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ phone, message })
  })
  return handleResponse(res)
}
