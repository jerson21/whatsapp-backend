import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchConversations,
  fetchConversation,
  sendMessage,
  markAsRead
} from '../api/conversations'
import { useAuthStore } from '../store/authStore'
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
  Heart,
  UserPlus,
  ArrowRightLeft,
  Building2,
  Inbox,
  Filter
} from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import AssignModal from '../components/AssignModal'
import TransferModal from '../components/TransferModal'

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
  'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-400',
  'bg-cyan-500', 'bg-emerald-500'
]

function getAvatarColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name, phone) {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name[0].toUpperCase()
  }
  return phone.slice(-2)
}

const FILTER_TABS = [
  { key: 'mine', label: 'Mis Chats', icon: User },
  { key: 'department', label: 'Departamento', icon: Building2 },
  { key: 'unassigned', label: 'Sin Asignar', icon: Inbox },
  { key: 'all', label: 'Todos', icon: Filter }
]

export default function Conversations() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selectedPhone, setSelectedPhone] = useState(searchParams.get('phone') || null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const messagesEndRef = useRef(null)
  const isInitialLoadRef = useRef(true)

  const agent = useAuthStore((s) => s.agent)
  const isSupervisor = agent?.role === 'supervisor'

  // Supervisores ven todo por defecto, agentes ven sus chats
  const [activeFilter, setActiveFilter] = useState(isSupervisor ? 'all' : 'mine')
  const activeFilterRef = useRef(activeFilter)
  activeFilterRef.current = activeFilter

  // Obtener conversación seleccionada
  const selectedConversation = conversations.find(c => c.phone === selectedPhone)
  const selectedPhoneRef = useRef(selectedPhone)
  selectedPhoneRef.current = selectedPhone

  // Socket global del dashboard (un solo socket para todo, estilo WhatsApp Web)
  const { socket, connected } = useSocket('/chat')

  useEffect(() => {
    loadConversations()

    // Polling cada 30 segundos como fallback (en caso de que socket falle)
    const interval = setInterval(() => {
      loadConversations()
    }, 30000)

    return () => {
      clearInterval(interval)
    }
  }, [activeFilter])

  useEffect(() => {
    if (!selectedPhone) return

    isInitialLoadRef.current = true
    loadMessages(selectedPhone)
    setSearchParams({ phone: selectedPhone })
  }, [selectedPhone])

  // Escuchar eventos de Socket.IO
  useEffect(() => {
    if (!socket) return

    // Nuevo mensaje (de cualquier conversación - socket global)
    socket.on('new_message', (data) => {
      console.log('Nuevo mensaje via WebSocket:', data)

      // Solo agregar al chat si corresponde a la conversación seleccionada
      if (data.phone && data.phone === selectedPhoneRef.current) {
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
            mediaType: data.media?.type || null,
            mediaId: data.media?.id || data.mediaId || null,
            mediaMime: data.media?.mime || null,
            mediaCaption: data.media?.caption || null,
            mediaExtra: data.media?.extra || null,
            media: data.media
          }]
        })

        // Marcar como leído inmediatamente (estamos viendo este chat)
        markAsRead(data.phone).then(() => loadConversations())
        return
      }

      // Actualizar la lista lateral (otro chat recibió mensaje)
      loadConversations()
    })

    // Escalamiento (de cualquier conversación)
    socket.on('escalation', (data) => {
      console.log('Escalamiento detectado:', data)
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

    // Chat asignado/transferido/liberado
    socket.on('chat_assigned', (data) => {
      console.log('Chat asignado:', data)
      loadConversations()
    })

    socket.on('chat_transferred', (data) => {
      console.log('Chat transferido:', data)
      loadConversations()
    })

    socket.on('chat_unassigned', (data) => {
      console.log('Chat liberado:', data)
      loadConversations()
    })

    // Status de agente (online/offline)
    socket.on('agent_status_change', (data) => {
      console.log('Agent status change:', data)
    })

    return () => {
      socket.off('new_message')
      socket.off('escalation')
      socket.off('message_status_update')
      socket.off('chat_assigned')
      socket.off('chat_transferred')
      socket.off('chat_unassigned')
      socket.off('agent_status_change')
    }
  }, [socket])

  useEffect(() => {
    if (isInitialLoadRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      isInitialLoadRef.current = false
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const loadConversations = async () => {
    try {
      const data = await fetchConversations(activeFilterRef.current)
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
  }

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone || sending) return

    setSending(true)
    try {
      await sendMessage(selectedPhone, newMessage)
      setNewMessage('')
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

  const handleSelfAssign = async () => {
    if (!selectedConversation) return
    const token = useAuthStore.getState().token
    try {
      const res = await fetch('/api/chat/self-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sessionId: selectedConversation.session_id || selectedConversation.sessionId || selectedConversation.id })
      })
      const data = await res.json()
      if (data.ok) loadConversations()
    } catch (err) {
      console.error('Error self-assigning:', err)
    }
  }

  const filteredConversations = conversations.filter(conv =>
    (conv.contact_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    conv.phone.includes(search)
  )

  const selectedConv = conversations.find(c => c.phone === selectedPhone)

  // Tabs visibles según rol
  const visibleTabs = isSupervisor
    ? FILTER_TABS
    : FILTER_TABS.filter(t => t.key !== 'all')

  // Renderizar contenido multimedia
  const renderMediaContent = (msg) => {
    const { mediaType, mediaId, mediaExtra, mediaMime, media } = msg

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
          <h2 className="text-xl font-bold text-gray-800 mb-3">Conversaciones</h2>

          {/* Filter Tabs */}
          <div className={`grid ${isSupervisor ? 'grid-cols-4' : 'grid-cols-3'} gap-1 mb-3 bg-gray-100 p-1 rounded-xl`}>
            {visibleTabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeFilter === tab.key
                      ? 'bg-white text-green-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

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
                <div className={`w-12 h-12 ${getAvatarColor(conv.contact_name || conv.phone)} rounded-full flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white font-semibold text-sm">
                    {getInitials(conv.contact_name, conv.phone)}
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
                  {/* Assignment badges */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {conv.department_name && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: (conv.department_color || '#6b7280') + '20',
                          color: conv.department_color || '#6b7280'
                        }}
                      >
                        <Building2 className="w-2.5 h-2.5" />
                        {conv.department_name}
                      </span>
                    )}
                    {conv.agent_name && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                        <User className="w-2.5 h-2.5" />
                        {conv.agent_name}
                      </span>
                    )}
                    {!conv.agent_name && !conv.department_name && conv.escalation_status === 'ESCALATED' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-600 font-medium">
                        <Inbox className="w-2.5 h-2.5" />
                        Sin asignar
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {conv.last_message_time
                        ? formatDistanceToNow(new Date(conv.last_message_time), {
                            addSuffix: true,
                            locale: es
                          })
                        : ''}
                    </span>
                  </div>
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
                <div className={`w-10 h-10 ${getAvatarColor(selectedConv?.contact_name || selectedPhone)} rounded-full flex items-center justify-center`}>
                  <span className="text-white font-semibold text-sm">
                    {getInitials(selectedConv?.contact_name, selectedPhone)}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-800">
                    {selectedConv?.contact_name || selectedPhone}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {selectedPhone}
                    </span>
                    {selectedConv?.department_name && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: (selectedConv.department_color || '#6b7280') + '20',
                          color: selectedConv.department_color || '#6b7280'
                        }}
                      >
                        <Building2 className="w-2.5 h-2.5" />
                        {selectedConv.department_name}
                      </span>
                    )}
                    {selectedConv?.agent_name && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                        <User className="w-2.5 h-2.5" />
                        {selectedConv.agent_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* Self-assign button - cuando no está asignado al agente actual */}
                {selectedConv && agent?.id > 0 && (!selectedConv.assigned_agent_id || selectedConv.assigned_agent_id !== agent.id) && (
                  <button
                    onClick={handleSelfAssign}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 rounded-lg border border-green-200 transition"
                    title="Tomar este chat"
                  >
                    <UserPlus className="w-4 h-4" />
                    Tomar
                  </button>
                )}

                {/* Assign button - siempre visible para supervisores */}
                {selectedConv && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition"
                    title="Asignar chat"
                  >
                    <UserPlus className="w-4 h-4" />
                    Asignar
                  </button>
                )}

                {/* Transfer button */}
                {selectedConv && (
                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
                    title="Transferir chat"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    Transferir
                  </button>
                )}

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
                    {renderMediaContent(msg)}
                    {(msg.body || msg.content) && (!msg.mediaType || msg.mediaType === 'reaction') && (
                      <p className="whitespace-pre-wrap">{msg.body || msg.content}</p>
                    )}
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
                          {msg.status === 'read' && <span className="text-blue-400">✓✓</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

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

      {/* Modals */}
      {showAssignModal && selectedConv && (
        <AssignModal
          sessionId={selectedConv.session_id || selectedConv.sessionId || selectedConv.id}
          currentAgentId={selectedConv.assigned_agent_id}
          currentDepartmentId={selectedConv.assigned_department_id}
          onClose={() => setShowAssignModal(false)}
          onAssigned={() => loadConversations()}
        />
      )}

      {showTransferModal && selectedConv && (
        <TransferModal
          sessionId={selectedConv.session_id || selectedConv.sessionId || selectedConv.id}
          currentAgentId={selectedConv.assigned_agent_id}
          currentDepartmentId={selectedConv.assigned_department_id}
          onClose={() => setShowTransferModal(false)}
          onTransferred={() => loadConversations()}
        />
      )}
    </div>
  )
}
