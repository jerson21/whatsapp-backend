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
  MessageSquare
} from 'lucide-react'

export default function Conversations() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selectedPhone, setSelectedPhone] = useState(searchParams.get('phone') || null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadConversations()
    // Polling cada 5 segundos para actualizar lista de conversaciones
    const interval = setInterval(loadConversations, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedPhone) {
      loadMessages(selectedPhone)
      setSearchParams({ phone: selectedPhone })

      // Polling cada 3 segundos para actualizar mensajes en tiempo real
      const interval = setInterval(() => {
        loadMessages(selectedPhone)
      }, 3000)

      return () => clearInterval(interval)
    }
  }, [selectedPhone])

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

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone || sending) return

    setSending(true)
    try {
      await sendMessage(selectedPhone, newMessage)
      setNewMessage('')
      // Recargar mensajes y conversaciones inmediatamente
      await loadMessages(selectedPhone)
      await loadConversations()
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
            <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-4">
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
                    <p className="whitespace-pre-wrap">{msg.body || msg.content}</p>
                    <p className={`text-xs mt-1 ${
                      msg.direction === 'outgoing' ? 'text-green-100' : 'text-gray-400'
                    }`}>
                      {msg.created_at
                        ? format(new Date(msg.created_at), 'HH:mm', { locale: es })
                        : ''}
                    </p>
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
                  onChange={(e) => setNewMessage(e.target.value)}
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
