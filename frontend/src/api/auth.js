export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Credenciales inválidas')
  }

  const data = await res.json()
  return {
    agent: data.agent,
    token: data.token,
    basicToken: data.basicToken
  }
}

export async function verifyToken(token) {
  const res = await fetch('/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  return res.ok
}
