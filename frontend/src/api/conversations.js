import { useAuthStore } from '../store/authStore'

const getHeaders = () => {
  const token = useAuthStore.getState().token
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

export async function fetchConversations(filter, departmentId) {
  const params = new URLSearchParams()
  if (filter) params.set('filter', filter)
  if (departmentId) params.set('departmentId', departmentId)
  const qs = params.toString()
  const res = await fetch(`/api/chat/conversations${qs ? '?' + qs : ''}`, {
    headers: getHeaders()
  })
  if (!res.ok) throw new Error('Error loading conversations')
  return res.json()
}

export async function fetchConversation(phone) {
  const res = await fetch(`/api/chat/conversations/${encodeURIComponent(phone)}`, {
    headers: getHeaders()
  })
  if (!res.ok) throw new Error('Error loading conversation')
  return res.json()
}

export async function sendMessage(phone, message) {
  const res = await fetch('/api/chat/send', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ to: phone, message })
  })
  if (!res.ok) throw new Error('Error sending message')
  return res.json()
}

export async function markAsRead(phone) {
  const res = await fetch('/api/chat/mark-read', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ phone })
  })
  if (!res.ok) throw new Error('Error marking as read')
  return res.json()
}

export async function sendMedia(phone, file, type, caption) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('to', phone)
  formData.append('type', type)
  if (caption) formData.append('caption', caption)

  const token = useAuthStore.getState().token
  const res = await fetch('/api/chat/send-media-panel', {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData
  })
  if (!res.ok) throw new Error('Error sending media')
  return res.json()
}

export async function fetchStats() {
  const res = await fetch('/api/chatbot/stats', {
    headers: getHeaders()
  })
  if (!res.ok) throw new Error('Error loading stats')
  return res.json()
}
