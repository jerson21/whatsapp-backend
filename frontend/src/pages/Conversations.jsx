import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchConversations,
  fetchConversation,
  sendMessage,
  markAsRead
} from '../api/conversations'
import { useAuthStore } from '../store/authStore'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow, format } from 'date-fns'
import { getDateLocale } from '../i18n/dateLocale'
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
  Filter,
  Trash2
} from 'lucide-react'
import { useSocket } from '../hooks/useSocket'
import AssignModal from '../components/AssignModal'
import TransferModal from '../components/TransferModal'

// Iconos de canal inline (SVG)
function WhatsAppIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

function InstagramIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  )
}

function MessengerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.3 2.246.464 3.443.464 6.627 0 12-4.974 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8.2l3.131 3.26 5.887-3.26-6.559 6.763z"/>
    </svg>
  )
}

function ChannelBadge({ channel }) {
  if (!channel || channel === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium" title="WhatsApp">
        <WhatsAppIcon className="w-2.5 h-2.5" />
        WA
      </span>
    )
  }
  if (channel === 'instagram') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-600 font-medium" title="Instagram">
        <InstagramIcon className="w-2.5 h-2.5" />
        IG
      </span>
    )
  }
  if (channel === 'messenger') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium" title="Messenger">
        <MessengerIcon className="w-2.5 h-2.5" />
        FB
      </span>
    )
  }
  return null
}

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

export default function Conversations() {
  const { t } = useTranslation('conversations')
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selectedPhone, setSelectedPhone] = useState(searchParams.get('phone') || null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('all')
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const messagesEndRef = useRef(null)
  const isInitialLoadRef = useRef(true)

  const agent = useAuthStore((s) => s.agent)
  const isSupervisor = agent?.role === 'supervisor'

  const [activeFilter, setActiveFilter] = useState(isSupervisor ? 'all' : 'mine')
  const activeFilterRef = useRef(activeFilter)
  activeFilterRef.current = activeFilter

  const selectedConversation = conversations.find(c => c.phone === selectedPhone)
  const selectedPhoneRef = useRef(selectedPhone)
  selectedPhoneRef.current = selectedPhone
  const selectedSessionId = selectedConversation?.session_id || selectedConversation?.sessionId || selectedConversation?.id || null
  const selectedSessionIdRef = useRef(selectedSessionId)
  selectedSessionIdRef.current = selectedSessionId
  const hasConnectedOnceRef = useRef(false)

  const { socket, connected } = useSocket('/chat')

  const filterTabs = [
    { key: 'mine', label: t('filters.myChats'), icon: User },
    { key: 'department', label: t('filters.department'), icon: Building2 },
    { key: 'unassigned', label: t('filters.unassigned'), icon: Inbox },
    { key: 'all', label: t('filters.all'), icon: Filter }
  ]

  const channelOptions = [
    { key: 'all', label: t('channels.all'), icon: null, color: 'gray' },
    { key: 'whatsapp', label: t('channels.whatsapp'), icon: WhatsAppIcon, color: 'green' },
    { key: 'instagram', label: t('channels.instagram'), icon: InstagramIcon, color: 'pink' },
  ]

  useEffect(() => {
    loadConversations()

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

  useEffect(() => {
    if (!socket) return

    socket.on('new_message', (data) => {
      // Comparación robusta: por phone (String) O por sessionId
      const isCurrentChat =
        (data.phone && String(data.phone) === String(selectedPhoneRef.current)) ||
        (data.sessionId && selectedSessionIdRef.current && Number(data.sessionId) === Number(selectedSessionIdRef.current))

      if (isCurrentChat) {
        setMessages(prev => {
          const exists = prev.find(m =>
            (data.msgId && m.waMsgId === data.msgId) ||
            (data.dbId && m.id === data.dbId)
          )
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

        markAsRead(data.phone).then(() => loadConversations())
        return
      }

      loadConversations()
    })

    socket.on('escalation', (data) => {
      console.log('Escalation detected:', data)
      loadConversations()
    })

    socket.on('message_status_update', (data) => {
      console.log('Status updated:', data)
      setMessages(prev => prev.map(msg =>
        msg.waMsgId === data.msgId
          ? { ...msg, status: data.status }
          : msg
      ))
    })

    socket.on('chat_assigned', (data) => {
      console.log('Chat assigned:', data)
      loadConversations()
    })

    socket.on('chat_transferred', (data) => {
      console.log('Chat transferred:', data)
      loadConversations()
    })

    socket.on('chat_unassigned', (data) => {
      console.log('Chat unassigned:', data)
      loadConversations()
    })

    socket.on('agent_status_change', (data) => {
      console.log('Agent status change:', data)
    })

    // Actualización async de nombre (Instagram profile fetch)
    socket.on('contact_name_update', (data) => {
      if (data.phone && data.contactName) {
        setConversations(prev => prev.map(c =>
          c.phone === data.phone
            ? { ...c, contact_name: data.contactName, name: data.contactName, ig_username: data.igUsername || c.ig_username, profile_pic_url: data.profilePic || c.profile_pic_url }
            : c
        ))
      }
    })

    // Al reconectar, recargar mensajes del chat abierto
    const onReconnect = () => {
      if (hasConnectedOnceRef.current) {
        console.log('Socket reconnected, reloading data...')
        if (selectedPhoneRef.current) {
          loadMessages(selectedPhoneRef.current)
        }
        loadConversations()
      }
      hasConnectedOnceRef.current = true
    }
    socket.on('connect', onReconnect)

    return () => {
      socket.off('new_message')
      socket.off('escalation')
      socket.off('message_status_update')
      socket.off('chat_assigned')
      socket.off('chat_transferred')
      socket.off('chat_unassigned')
      socket.off('agent_status_change')
      socket.off('contact_name_update')
      socket.off('connect', onReconnect)
    }
  }, [socket])

  // Unirse al room de la sesión activa para recibir mensajes directos
  useEffect(() => {
    if (!socket || !selectedSessionId) return
    socket.emit('join_session', { sessionId: selectedSessionId })
    return () => {
      socket.emit('leave_session', { sessionId: selectedSessionId })
    }
  }, [socket, selectedSessionId])

  useEffect(() => {
    if (isInitialLoadRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      isInitialLoadRef.current = false
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const loadConversations = async (filterOverride) => {
    try {
      const filterToUse = filterOverride || activeFilterRef.current
      const data = await fetchConversations(filterToUse)
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

  // Typing indicator: debounce para no spamear
  const typingTimeoutRef = useRef(null)
  const handleInputChange = (e) => {
    setNewMessage(e.target.value)
    if (!socket || !selectedSessionId) return
    if (e.target.value.trim()) {
      // Enviar typing_start (debounced cada 3s)
      if (!typingTimeoutRef.current) {
        socket.emit('typing_start', { sessionId: selectedSessionId })
      }
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null
      }, 3000)
    } else if (typingTimeoutRef.current) {
      // Borro todo el texto: parar typing
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
      socket.emit('typing_stop', { sessionId: selectedSessionId })
    }
  }

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone || sending) return

    setSending(true)
    try {
      await sendMessage(selectedPhone, newMessage)
      setNewMessage('')
    } catch (err) {
      console.error('Error sending message:', err)
      alert(t('sendError'))
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

  const handleDeleteConversation = async () => {
    if (!selectedConv) return
    const sessionId = selectedConv.session_id || selectedConv.sessionId || selectedConv.id
    if (!confirm(t('deleteConfirm', { name: selectedConv.contact_name || selectedConv.phone }))) return
    const token = useAuthStore.getState().token
    try {
      const res = await fetch(`/api/chat/conversations/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
      const data = await res.json()
      if (data.ok) {
        setSelectedPhone(null)
        setMessages([])
        loadConversations()
      } else {
        alert(data.error || t('deleteError'))
      }
    } catch (err) {
      console.error('Error deleting conversation:', err)
      alert(t('deleteConversationError'))
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

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = (conv.contact_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      conv.phone.includes(search)
    const convChannel = conv.channel || 'whatsapp'
    const matchesChannel = channelFilter === 'all' || convChannel === channelFilter
    return matchesSearch && matchesChannel
  })

  const selectedConv = conversations.find(c => c.phone === selectedPhone)

  const visibleTabs = isSupervisor
    ? filterTabs
    : filterTabs.filter(tab => tab.key !== 'all')

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
    const mediaUrl = (id && (id.startsWith('http://') || id.startsWith('https://'))) ? id : `${baseUrl}/${id}`

    switch (type) {
      case 'image':
        return (
          <div className="mt-2 rounded-lg overflow-hidden max-w-xs">
            <img
              src={mediaUrl}
              alt={t('image')}
              className="w-full h-auto cursor-pointer hover:opacity-90"
              onClick={() => window.open(mediaUrl, '_blank')}
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div className="hidden items-center gap-2 p-3 bg-gray-100 rounded-lg">
              <ImageIcon className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-600">{t('imageUnavailable')}</span>
            </div>
          </div>
        )

      case 'video':
        return (
          <div className="mt-2 rounded-lg overflow-hidden max-w-xs">
            <video
              src={mediaUrl}
              controls
              className="w-full h-auto rounded-lg"
              preload="metadata"
            >
              {t('videoUnsupported')}
            </video>
          </div>
        )

      case 'audio':
        return (
          <div className={`mt-2 flex items-center gap-2 p-2 rounded-lg ${isOutgoing ? 'bg-green-600' : 'bg-gray-100'}`}>
            <Mic className={`w-5 h-5 ${isOutgoing ? 'text-white' : 'text-green-600'}`} />
            <audio
              src={mediaUrl}
              controls
              className="h-8 flex-1"
              preload="metadata"
            />
          </div>
        )

      case 'document':
        const filename = extra?.filename || t('document')
        return (
          <a
            href={mediaUrl}
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
                {mime || t('document')}
              </p>
            </div>
            <Download className={`w-5 h-5 ${isOutgoing ? 'text-white' : 'text-gray-500'}`} />
          </a>
        )

      case 'sticker':
        return (
          <div className="mt-2">
            <img
              src={mediaUrl}
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
                {contacts.length === 1 ? t('sharedContact') : t('sharedContacts', { count: contacts.length })}
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
          <h2 className="text-xl font-bold text-gray-800 mb-3">{t('title')}</h2>

          {/* Filter Tabs */}
          <div className={`grid ${isSupervisor ? 'grid-cols-4' : 'grid-cols-3'} gap-1 mb-3 bg-gray-100 p-1 rounded-xl`}>
            {visibleTabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveFilter(tab.key)
                    activeFilterRef.current = tab.key
                    loadConversations(tab.key)
                  }}
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

          {/* Channel Filter */}
          <div className="flex gap-1 mb-3">
            {channelOptions.map(ch => {
              const Icon = ch.icon
              const isActive = channelFilter === ch.key
              return (
                <button
                  key={ch.key}
                  onClick={() => setChannelFilter(ch.key)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    isActive
                      ? ch.key === 'whatsapp' ? 'bg-green-50 text-green-700 border-green-200'
                        : ch.key === 'instagram' ? 'bg-pink-50 text-pink-700 border-pink-200'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {ch.label}
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
              placeholder={t('search')}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('noConversations')}</p>
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
                {conv.profile_pic_url ? (
                  <img src={conv.profile_pic_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                ) : null}
                <div className={`w-12 h-12 ${getAvatarColor(conv.contact_name || conv.phone)} rounded-full flex items-center justify-center flex-shrink-0`} style={conv.profile_pic_url ? { display: 'none' } : {}}>
                  <span className="text-white font-semibold text-sm">
                    {getInitials(conv.contact_name, conv.phone)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {conv.contact_name || conv.phone}
                      </p>
                      {conv.ig_username && (
                        <span className="text-xs text-gray-400 truncate flex-shrink-0">@{conv.ig_username}</span>
                      )}
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="bg-green-500 text-white text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {conv.last_message || t('noMessages')}
                  </p>
                  {/* Channel & Assignment badges */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <ChannelBadge channel={conv.channel} />
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
                        {t('unassignedBadge')}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {conv.last_message_time
                        ? formatDistanceToNow(new Date(conv.last_message_time), {
                            addSuffix: true,
                            locale: getDateLocale()
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
              <p className="text-lg">{t('selectConversation')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header del chat */}
            <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {selectedConv?.profile_pic_url ? (
                  <img src={selectedConv.profile_pic_url} alt="" className="w-10 h-10 rounded-full object-cover" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                ) : null}
                <div className={`w-10 h-10 ${getAvatarColor(selectedConv?.contact_name || selectedPhone)} rounded-full flex items-center justify-center`} style={selectedConv?.profile_pic_url ? { display: 'none' } : {}}>
                  <span className="text-white font-semibold text-sm">
                    {getInitials(selectedConv?.contact_name, selectedPhone)}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800">
                      {selectedConv?.contact_name || selectedPhone}
                    </p>
                    {selectedConv?.ig_username && (
                      <span className="text-sm text-gray-400">@{selectedConv.ig_username}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <ChannelBadge channel={selectedConv?.channel} />
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
                {selectedConv && agent?.id > 0 && (!selectedConv.assigned_agent_id || selectedConv.assigned_agent_id !== agent.id) && (
                  <button
                    onClick={handleSelfAssign}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 rounded-lg border border-green-200 transition"
                    title={t('takeTitle')}
                  >
                    <UserPlus className="w-4 h-4" />
                    {t('take')}
                  </button>
                )}

                {selectedConv && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition"
                    title={t('assignTitle')}
                  >
                    <UserPlus className="w-4 h-4" />
                    {t('assign')}
                  </button>
                )}

                {selectedConv && (
                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
                    title={t('transferTitle')}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    {t('transfer')}
                  </button>
                )}

                {selectedConv && isSupervisor && (
                  <button
                    onClick={handleDeleteConversation}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 rounded-lg border border-red-200 transition"
                    title={t('deleteTitle')}
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('delete')}
                  </button>
                )}

                {/* WebSocket connection indicator */}
                <div className="text-sm">
                  {connected ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                      {t('realtime')}
                    </span>
                  ) : (
                    <span className="text-yellow-600 flex items-center gap-1">
                      <span className="w-2 h-2 bg-yellow-600 rounded-full"></span>
                      {t('reconnecting')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => {
                const ch = selectedConv?.channel;
                const isIG = ch === 'instagram';
                const outBg = isIG
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-br-md'
                  : 'bg-green-500 text-white rounded-br-md';
                const inBg = isIG
                  ? 'bg-pink-50 text-gray-800 rounded-bl-md shadow-sm'
                  : 'bg-white text-gray-800 rounded-bl-md shadow-sm';
                const botLabel = isIG ? 'text-pink-200' : 'text-green-100';

                return (
                <div
                  key={idx}
                  className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-2 rounded-2xl ${
                      msg.direction === 'outgoing' ? outBg : inBg
                    }`}
                  >
                    {msg.direction === 'incoming' && (
                      <div className={`flex items-center gap-1 text-xs mb-1 ${isIG ? 'text-pink-400' : 'text-gray-400'}`}>
                        <User className="w-3 h-3" />
                        {t('client')}
                      </div>
                    )}
                    {msg.direction === 'outgoing' && msg.is_bot && (
                      <div className={`flex items-center gap-1 text-xs ${botLabel} mb-1`}>
                        <Bot className="w-3 h-3" />
                        {t('bot')}
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
                          ? format(new Date(msg.created_at), 'HH:mm', { locale: getDateLocale() })
                          : ''}
                      </span>
                      {msg.direction === 'outgoing' && (
                        <span className="ml-1">
                          {msg.status === 'sent' && '✓'}
                          {msg.status === 'delivered' && '✓✓'}
                          {msg.status === 'read' && <span className="text-blue-200 font-bold">✓✓</span>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
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
                  placeholder={t('messagePlaceholder')}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                  className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  {sending ? t('sending') : t('send')}
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
