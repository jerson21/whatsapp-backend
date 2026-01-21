export async function login(username, password) {
  const token = btoa(`${username}:${password}`)

  // Verificar credenciales probando un endpoint protegido
  const res = await fetch('/api/chatbot/stats', {
    headers: {
      'Authorization': `Basic ${token}`
    }
  })

  if (!res.ok) {
    throw new Error('Credenciales inválidas')
  }

  return {
    user: { username },
    token
  }
}

export async function verifyToken(token) {
  const res = await fetch('/api/chatbot/stats', {
    headers: {
      'Authorization': `Basic ${token}`
    }
  })

  return res.ok
}
