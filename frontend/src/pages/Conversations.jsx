import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchConversations,
  fetchConversation,
  sendMessage,
  markAsRead
} from '../api/conversations'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Search,
  Send,
  User,
  Bot,
  Phone,
  MessageSquare,
  MapPin,
  FileText,
  Download,
  Play,
  Image as ImageIcon,
  Mic,
  Users,
  Heart
} from 'lucide-react'
import { useSocket } from '../hooks/useSocket'

export default function Conversations() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selectedPhone, setSelectedPhone] = useState(searchParams.get('phone') || null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [typingOperators, setTypingOperators] = useState(new Set())
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Obtener conversación seleccionada
  const selectedConversation = conversations.find(c => c.phone === selectedPhone)

  // Conectar socket solo cuando hay conversación seleccionada
  const { socket, connected } = useSocket(
    '/chat',
    selectedConversation?.sessionId,
    selectedConversation?.token
  )

  useEffect(() => {
    loadConversations()

    // Polling cada 30 segundos como fallback (en caso de que socket falle)
    const interval = setInterval(() => {
      loadConversations()
    }, 30000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!selectedPhone) return

    loadMessages(selectedPhone)
    setSearchParams({ phone: selectedPhone })
  }, [selectedPhone])

  // Escuchar eventos de Socket.IO
  useEffect(() => {
    if (!socket) return

    // Nuevo mensaje (de cualquier operador o cliente)
    socket.on('new_message', (data) => {
      console.log('Nuevo mensaje via WebSocket:', data)

      // Agregar mensaje a la lista (prevenir duplicados por ID)
      setMessages(prev => {
        const exists = prev.find(m => m.waMsgId === data.msgId || m.id === data.dbId)
        if (exists) return prev

        return [...prev, {
          id: data.dbId || Date.now(),
          direction: data.direction === 'in' ? 'incoming' : 'outgoing',
          body: data.text,
          content: data.text,
          created_at: new Date(data.timestamp).toISOString(),
          status: data.status,
          waMsgId: data.msgId,
          is_bot: data.isAI || false,
          // Información de media
          mediaType: data.media?.type || null,
          mediaId: data.media?.id || data.mediaId || null,
          mediaMime: data.media?.mime || null,
          mediaCaption: data.media?.caption || null,
          mediaExtra: data.media?.extra || null,
          media: data.media // Mantener referencia completa para compatibilidad
        }]
      })

      // Recargar lista de conversaciones para actualizar "último mensaje"
      loadConversations()
    })

    // Operador escribiendo
    socket.on('operator_typing', (data) => {
      if (data.typing) {
        setTypingOperators(prev => new Set(prev).add(data.socketId))
      } else {
        setTypingOperators(prev => {
          const newSet = new Set(prev)
          newSet.delete(data.socketId)
          return newSet
        })
      }
    })

    // Operador se unió
    socket.on('operator_joined', (data) => {
      console.log('Operador se unió:', data.socketId)
    })

    // Operador salió
    socket.on('operator_left', (data) => {
      console.log('Operador salió:', data.socketId)
      setTypingOperators(prev => {
        const newSet = new Set(prev)
        newSet.delete(data.socketId)
        return newSet
      })
    })

    // Escalamiento
    socket.on('escalation', (data) => {
      console.log('Escalamiento detectado:', data)
      // Recargar conversaciones para ver el cambio de estado
      loadConversations()
    })

    // Actualización de status de mensaje (delivered, read)
    socket.on('message_status_update', (data) => {
      console.log('Status actualizado:', data)
      setMessages(prev => prev.map(msg =>
        msg.waMsgId === data.msgId
          ? { ...msg, status: data.status }
          : msg
      ))
    })

    return () => {
      socket.off('new_message')
      socket.off('operator_typing')
      socket.off('operator_joined')
      socket.off('operator_left')
      socket.off('escalation')
      socket.off('message_status_update')
    }
  }, [socket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadConversations = async () => {
    try {
      const data = await fetchConversations()
      setConversations(data.conversations || [])
    } catch (err) {
      console.error('Error loading conversations:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (phone) => {
    try {
      const data = await fetchConversation(phone)
      setMessages(data.messages || [])
      await markAsRead(phone)
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const handleInputChange = (e) => {
    setNewMessage(e.target.value)

    if (!socket) return

    // Emitir typing_start
    socket.emit('typing_start')

    // Cancelar timeout previo
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Emitir typing_stop después de 3 segundos de inactividad
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop')
    }, 3000)
  }

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone || sending) return

    // Emitir typing_stop
    if (socket) {
      socket.emit('typing_stop')
    }

    setSending(true)
    try {
      await sendMessage(selectedPhone, newMessage)
      setNewMessage('')
      // No necesitamos recargar mensajes, WebSocket lo hará automáticamente
    } catch (err) {
      console.error('Error sending message:', err)
      alert('Error al enviar mensaje')
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const filteredConversations = conversations.filter(conv =>
    (conv.contact_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    conv.phone.includes(search)
  )

  const selectedConv = conversations.find(c => c.phone === selectedPhone)

  // Mostrar indicador de "escribiendo"
  const renderTypingIndicator = () => {
    if (typingOperators.size === 0) return null

    return (
      <div className="px-4 py-2 bg-gray-50 text-sm text-gray-600 italic">
        {typingOperators.size === 1
          ? 'Un operador está escribiendo...'
          : `${typingOperators.size} operadores están escribiendo...`}
      </div>
    )
  }

  // Renderizar contenido multimedia
  const renderMediaContent = (msg) => {
    const { mediaType, mediaId, mediaExtra, mediaMime, media } = msg

    // Para mensajes en tiempo real via WebSocket
    const type = mediaType || media?.type
    const id = mediaId || media?.id
    const mime = mediaMime || media?.mime
    const extra = mediaExtra || media?.extra

    if (!type) return null

    const isOutgoing = msg.direction === 'outgoing'
    const baseUrl = '/api/chat/media'

    switch (type) {
      case 'image':
        return (
          <div className="mt-2 rounded-lg overflow-hidden max-w-xs">
            <img
              src={`${baseUrl}/${id}`}
              alt="Imagen"
              className="w-full h-auto cursor-pointer hover:opacity-90"
              onClick={() => window.open(`${baseUrl}/${id}`, '_blank')}
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div className="hidden items-center gap-2 p-3 bg-gray-100 rounded-lg">
              <ImageIcon className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-600">Imagen no disponible</span>
            </div>
          </div>
        )

      case 'video':
        return (
          <div className="mt-2 rounded-lg overflow-hidden max-w-xs">
            <video
              src={`${baseUrl}/${id}`}
              controls
              className="w-full h-auto rounded-lg"
              preload="metadata"
            >
              Tu navegador no soporta video
            </video>
          </div>
        )

      case 'audio':
        return (
          <div className={`mt-2 flex items-center gap-2 p-2 rounded-lg ${isOutgoing ? 'bg-green-600' : 'bg-gray-100'}`}>
            <Mic className={`w-5 h-5 ${isOutgoing ? 'text-white' : 'text-green-600'}`} />
            <audio
              src={`${baseUrl}/${id}`}
              controls
              className="h-8 flex-1"
              preload="metadata"
            />
          </div>
        )

      case 'document':
        const filename = extra?.filename || 'Documento'
        return (
          <a
            href={`${baseUrl}/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2 flex items-center gap-3 p-3 rounded-lg ${isOutgoing ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-100 hover:bg-gray-200'} transition`}
          >
            <FileText className={`w-8 h-8 ${isOutgoing ? 'text-white' : 'text-blue-600'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isOutgoing ? 'text-white' : 'text-gray-800'}`}>
                {filename}
              </p>
              <p className={`text-xs ${isOutgoing ? 'text-green-100' : 'text-gray-500'}`}>
                {mime || 'Documento'}
              </p>
            </div>
            <Download className={`w-5 h-5 ${isOutgoing ? 'text-white' : 'text-gray-500'}`} />
          </a>
        )

      case 'sticker':
        return (
          <div className="mt-2">
            <img
              src={`${baseUrl}/${id}`}
              alt="Sticker"
              className="w-32 h-32 object-contain"
              onError={(e) => {
                e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
              }}
            />
          </div>
        )

      case 'location':
        const lat = extra?.latitude
        const lng = extra?.longitude
        const locName = extra?.name
        const locAddress = extra?.address
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`

        return (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2 block p-3 rounded-lg ${isOutgoing ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-100 hover:bg-gray-200'} transition`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full ${isOutgoing ? 'bg-green-500' : 'bg-red-100'}`}>
                <MapPin className={`w-5 h-5 ${isOutgoing ? 'text-white' : 'text-red-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                {locName && (
                  <p className={`font-medium ${isOutgoing ? 'text-white' : 'text-gray-800'}`}>
                    {locName}
                  </p>
                )}
                {locAddress && (
                  <p className={`text-sm ${isOutgoing ? 'text-green-100' : 'text-gray-600'}`}>
                    {locAddress}
                  </p>
                )}
                <p className={`text-xs mt-1 ${isOutgoing ? 'text-green-200' : 'text-gray-500'}`}>
                  {lat?.toFixed(6)}, {lng?.toFixed(6)}
                </p>
              </div>
            </div>
          </a>
        )

      case 'contacts':
        const contacts = extra?.contacts || []
        return (
          <div className={`mt-2 p-3 rounded-lg ${isOutgoing ? 'bg-green-600' : 'bg-gray-100'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Users className={`w-5 h-5 ${isOutgoing ? 'text-white' : 'text-blue-600'}`} />
              <span className={`font-medium ${isOutgoing ? 'text-white' : 'text-gray-800'}`}>
                {contacts.length === 1 ? 'Contacto compartido' : `${contacts.length} contactos`}
              </span>
            </div>
            {contacts.map((contact, idx) => (
              <div key={idx} className={`p-2 rounded ${isOutgoing ? 'bg-green-500' : 'bg-white'} ${idx > 0 ? 'mt-2' : ''}`}>
                <p className={`font-medium ${isOutgoing ? 'text-white' : 'text-gray-800'}`}>
                  {contact.name}
                </p>
                {contact.phones?.map((phone, pidx) => (
                  <p key={pidx} className={`text-sm ${isOutgoing ? 'text-green-100' : 'text-gray-600'}`}>
                    {phone.phone} {phone.type && `(${phone.type})`}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )

      case 'reaction':
        const emoji = extra?.emoji || msg.body
        return (
          <div className="flex items-center gap-1">
            <Heart className={`w-4 h-4 ${isOutgoing ? 'text-white' : 'text-pink-500'}`} />
            <span className="text-2xl">{emoji}</span>
          </div>
        )

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="h-screen flex">
      {/* Lista de conversaciones */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Conversaciones</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversación..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No hay conversaciones</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.phone}
                onClick={() => setSelectedPhone(conv.phone)}
                className={`w-full flex items-center gap-3 p-4 border-b border-gray-100 hover:bg-gray-50 transition text-left ${
                  selectedPhone === conv.phone ? 'bg-green-50' : ''
                }`}
              >
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 font-medium">
                    {conv.contact_name?.[0]?.toUpperCase() || conv.phone.slice(-2)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-800 truncate">
                      {conv.contact_name || conv.phone}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="bg-green-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {conv.last_message || 'Sin mensajes'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {conv.last_message_time
                      ? formatDistanceToNow(new Date(conv.last_message_time), {
                          addSuffix: true,
                          locale: es
                        })
                      : ''}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {!selectedPhone ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Selecciona una conversación</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header del chat */}
            <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">
                    {selectedConv?.contact_name || selectedPhone}
                  </p>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {selectedPhone}
                  </p>
                </div>
              </div>
              {/* Indicador de conexión WebSocket */}
              <div className="text-sm">
                {connected ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                    Tiempo real
                  </span>
                ) : (
                  <span className="text-yellow-600 flex items-center gap-1">
                    <span className="w-2 h-2 bg-yellow-600 rounded-full"></span>
                    Reconectando...
                  </span>
                )}
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-2 rounded-2xl ${
                      msg.direction === 'outgoing'
                        ? 'bg-green-500 text-white rounded-br-md'
                        : 'bg-white text-gray-800 rounded-bl-md shadow-sm'
                    }`}
                  >
                    {msg.direction === 'incoming' && (
                      <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                        <User className="w-3 h-3" />
                        Cliente
                      </div>
                    )}
                    {msg.direction === 'outgoing' && msg.is_bot && (
                      <div className="flex items-center gap-1 text-xs text-green-100 mb-1">
                        <Bot className="w-3 h-3" />
                        Bot
                      </div>
                    )}
                    {/* Renderizar contenido multimedia si existe */}
                    {renderMediaContent(msg)}
                    {/* Texto del mensaje (caption o texto normal) */}
                    {(msg.body || msg.content) && (!msg.mediaType || msg.mediaType === 'reaction') && (
                      <p className="whitespace-pre-wrap">{msg.body || msg.content}</p>
                    )}
                    {/* Caption para media con texto */}
                    {msg.mediaType && msg.mediaType !== 'reaction' && (msg.mediaCaption || msg.body) && (
                      <p className="whitespace-pre-wrap mt-2 text-sm">{msg.mediaCaption || msg.body}</p>
                    )}
                    <div className={`flex items-center gap-1 text-xs mt-1 ${
                      msg.direction === 'outgoing' ? 'text-white opacity-90' : 'text-gray-400'
                    }`}>
                      <span>
                        {msg.created_at
                          ? format(new Date(msg.created_at), 'HH:mm', { locale: es })
                          : ''}
                      </span>
                      {msg.direction === 'outgoing' && (
                        <span className="ml-1">
                          {msg.status === 'sent' && '✓'}
                          {msg.status === 'delivered' && '✓✓'}
                          {msg.status === 'read' && <span className="text-blue-200">✓✓</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Indicador de "escribiendo" */}
            {renderTypingIndicator()}

            {/* Input */}
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                  className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  {sending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
