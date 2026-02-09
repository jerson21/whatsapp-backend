import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useSocket } from '../hooks/useSocket'
import {
  MessageCircle,
  Send,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  Film,
  ShoppingBag,
  RefreshCw,
  ChevronLeft,
  CheckCircle,
  AlertCircle,
  Mail,
  Globe,
  Users,
  Zap,
  Plus,
  Edit3,
  ToggleLeft,
  ToggleRight,
  Hash
} from 'lucide-react'

function InstagramIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  )
}

const getHeaders = () => {
  const token = useAuthStore.getState().token
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

function MediaTypeBadge({ type, adId }) {
  if (adId) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <ShoppingBag className="w-3 h-3" /> AD
      </span>
    )
  }
  switch (type) {
    case 'FEED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <ImageIcon className="w-3 h-3" /> Feed
        </span>
      )
    case 'REELS':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          <Film className="w-3 h-3" /> Reel
        </span>
      )
    case 'STORY':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          <AlertCircle className="w-3 h-3" /> Story
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          {type || 'Post'}
        </span>
      )
  }
}

function timeAgo(dateStr) {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = Math.floor((now - date) / 1000)
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

export default function InstagramComments() {
  const [posts, setPosts] = useState([])
  const [selectedPost, setSelectedPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyMode, setReplyMode] = useState('public') // 'public' | 'private'
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState('all') // all, unreplied, replied
  const [groupBy, setGroupBy] = useState('posts') // 'posts' | 'commenters'
  const [commenters, setCommenters] = useState([])
  const [selectedCommenter, setSelectedCommenter] = useState(null)
  const [activeTab, setActiveTab] = useState('comments') // 'comments' | 'triggers'
  const [triggers, setTriggers] = useState([])
  const [triggerForm, setTriggerForm] = useState(null) // null = closed, {} = new, {id:...} = editing
  const { socket } = useSocket('/chat')

  // Cargar posts
  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/instagram/comments/posts', { headers: getHeaders() })
      const data = await res.json()
      if (data.ok) setPosts(data.posts)
    } catch (e) {
      console.error('Error loading posts:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Cargar commenters
  const loadCommenters = useCallback(async () => {
    try {
      const res = await fetch('/api/instagram/comments/commenters', { headers: getHeaders() })
      const data = await res.json()
      if (data.ok) setCommenters(data.commenters)
    } catch (e) {
      console.error('Error loading commenters:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Cargar comentarios de un post o commenter
  const loadComments = useCallback(async (mediaId, fromId) => {
    try {
      const replied = filter === 'replied' ? 'true' : filter === 'unreplied' ? 'false' : ''
      const params = new URLSearchParams({ limit: '200' })
      if (mediaId) params.set('mediaId', mediaId)
      if (fromId) params.set('fromId', fromId)
      if (replied) params.set('replied', replied)
      const res = await fetch(`/api/instagram/comments?${params}`, { headers: getHeaders() })
      const data = await res.json()
      if (data.ok) setComments(data.comments)
    } catch (e) {
      console.error('Error loading comments:', e)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    if (groupBy === 'posts') loadPosts()
    else loadCommenters()
  }, [groupBy, loadPosts, loadCommenters])

  useEffect(() => {
    if (groupBy === 'posts' && selectedPost) loadComments(selectedPost.media_id, null)
    else if (groupBy === 'commenters' && selectedCommenter) loadComments(null, selectedCommenter.from_id)
  }, [selectedPost, selectedCommenter, groupBy, loadComments])

  // Socket.IO: nuevo comentario
  useEffect(() => {
    if (!socket) return
    const handleNew = (data) => {
      // Recargar lista para actualizar conteos
      if (groupBy === 'posts') loadPosts()
      else loadCommenters()
      // Si estamos viendo el post/commenter de este comentario, agregar
      if ((groupBy === 'posts' && selectedPost && data.mediaId === selectedPost.media_id) ||
          (groupBy === 'commenters' && selectedCommenter && data.fromId === selectedCommenter.from_id)) {
        setComments(prev => [{
          comment_id: data.commentId,
          parent_comment_id: data.parentId,
          media_id: data.mediaId,
          media_product_type: data.mediaProductType,
          ad_id: data.adId,
          ad_title: data.adTitle,
          from_id: data.fromId,
          from_username: data.fromUsername,
          text: data.text,
          replied: false,
          hidden: false,
          created_at: data.createdAt
        }, ...prev])
      }
    }
    const handleReplied = (data) => {
      setComments(prev => prev.map(c =>
        c.comment_id === data.commentId
          ? { ...c, replied: true, reply_text: data.replyText, replied_by: data.repliedBy, replied_at: data.repliedAt }
          : c
      ))
      if (groupBy === 'posts') loadPosts()
      else loadCommenters()
    }
    const handleDeleted = (data) => {
      setComments(prev => prev.filter(c => c.comment_id !== data.commentId))
      if (groupBy === 'posts') loadPosts()
      else loadCommenters()
    }
    socket.on('new_ig_comment', handleNew)
    socket.on('ig_comment_replied', handleReplied)
    socket.on('ig_comment_deleted', handleDeleted)
    return () => {
      socket.off('new_ig_comment', handleNew)
      socket.off('ig_comment_replied', handleReplied)
      socket.off('ig_comment_deleted', handleDeleted)
    }
  }, [socket, selectedPost, selectedCommenter, groupBy, loadPosts, loadCommenters])

  // Responder a un comentario (público o privado)
  const handleReply = async (commentId) => {
    if (!replyText.trim() || sending) return
    setSending(true)
    try {
      const endpoint = replyMode === 'private'
        ? `/api/instagram/comments/${commentId}/private-reply`
        : `/api/instagram/comments/${commentId}/reply`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ message: replyText.trim() })
      })
      const data = await res.json()
      if (data.ok) {
        setReplyText('')
        setReplyingTo(null)
        setReplyMode('public')
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (e) {
      alert(`Error: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  // Ocultar/mostrar comentario
  const handleHide = async (commentId, hide) => {
    try {
      await fetch(`/api/instagram/comments/${commentId}/hide`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ hide })
      })
      setComments(prev => prev.map(c =>
        c.comment_id === commentId ? { ...c, hidden: hide } : c
      ))
    } catch (e) {
      alert(`Error: ${e.message}`)
    }
  }

  // Eliminar comentario
  const handleDelete = async (commentId) => {
    if (!confirm('Eliminar este comentario de Instagram?')) return
    try {
      await fetch(`/api/instagram/comments/${commentId}`, {
        method: 'DELETE',
        headers: getHeaders()
      })
    } catch (e) {
      alert(`Error: ${e.message}`)
    }
  }

  // ─── Triggers ───
  const loadTriggers = useCallback(async () => {
    try {
      const res = await fetch('/api/instagram/triggers', { headers: getHeaders() })
      const data = await res.json()
      if (data.ok) setTriggers(data.triggers)
    } catch (e) {
      console.error('Error loading triggers:', e)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'triggers') loadTriggers()
  }, [activeTab, loadTriggers])

  const saveTrigger = async () => {
    if (!triggerForm) return
    const { id, name, keywords, response_message, reply_type, match_type, trigger_source } = triggerForm
    if (!name?.trim() || !keywords?.trim() || !response_message?.trim()) {
      alert('Completa todos los campos')
      return
    }
    try {
      const method = id ? 'PUT' : 'POST'
      const url = id ? `/api/instagram/triggers/${id}` : '/api/instagram/triggers'
      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify({ name, keywords, response_message, reply_type: reply_type || 'private', match_type: match_type || 'contains', trigger_source: trigger_source || 'both' })
      })
      const data = await res.json()
      if (data.ok) {
        setTriggerForm(null)
        loadTriggers()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (e) {
      alert(`Error: ${e.message}`)
    }
  }

  const toggleTrigger = async (trigger) => {
    try {
      await fetch(`/api/instagram/triggers/${trigger.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ is_active: !trigger.is_active })
      })
      loadTriggers()
    } catch (e) {
      alert(`Error: ${e.message}`)
    }
  }

  const deleteTrigger = async (id) => {
    if (!confirm('Eliminar este trigger?')) return
    try {
      await fetch(`/api/instagram/triggers/${id}`, { method: 'DELETE', headers: getHeaders() })
      loadTriggers()
    } catch (e) {
      alert(`Error: ${e.message}`)
    }
  }

  const totalUnreplied = groupBy === 'posts'
    ? posts.reduce((sum, p) => sum + (parseInt(p.unreplied_count) || 0), 0)
    : commenters.reduce((sum, c) => sum + (parseInt(c.unreplied_count) || 0), 0)

  return (
    <div className="h-full flex flex-col">
      {/* Tabs superiores */}
      <div className="bg-white border-b border-gray-200 px-4 flex items-center gap-1">
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'comments'
              ? 'border-pink-500 text-pink-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          Comentarios
          {totalUnreplied > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{totalUnreplied}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('triggers')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'triggers'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Zap className="w-4 h-4" />
          Triggers
          {triggers.filter(t => t.is_active).length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {triggers.filter(t => t.is_active).length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'triggers' ? (
        /* ═══ Vista Triggers ═══ */
        <div className="flex-1 flex overflow-hidden">
          {/* Lista de triggers */}
          <div className={`${triggerForm ? 'hidden md:flex' : 'flex'} w-full md:w-96 flex-col border-r border-gray-200 bg-white`}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-gray-800">Comment Triggers</h2>
              </div>
              <button
                onClick={() => setTriggerForm({ name: '', keywords: '', response_message: '', reply_type: 'private', match_type: 'contains', trigger_source: 'both' })}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition"
              >
                <Plus className="w-4 h-4" /> Nuevo
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {triggers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 px-4">
                  <Zap className="w-12 h-12 mb-3" />
                  <p className="text-center font-medium">No hay triggers</p>
                  <p className="text-xs text-center mt-1">Crea uno para auto-responder cuando alguien comente una palabra clave</p>
                </div>
              ) : (
                triggers.map(trigger => (
                  <div
                    key={trigger.id}
                    className={`p-4 border-b border-gray-100 ${!trigger.is_active ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${trigger.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-sm font-medium text-gray-800">{trigger.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleTrigger(trigger)}
                          className="p-1 text-gray-400 hover:text-amber-500 transition"
                          title={trigger.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {trigger.is_active
                            ? <ToggleRight className="w-5 h-5 text-green-500" />
                            : <ToggleLeft className="w-5 h-5" />
                          }
                        </button>
                        <button
                          onClick={() => setTriggerForm({
                            id: trigger.id,
                            name: trigger.name,
                            keywords: trigger.keywords,
                            response_message: trigger.response_message,
                            reply_type: trigger.reply_type,
                            match_type: trigger.match_type,
                            trigger_source: trigger.trigger_source || 'both'
                          })}
                          className="p-1 text-gray-400 hover:text-blue-500 transition"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteTrigger(trigger.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Keywords */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {trigger.keywords.split(',').map((kw, i) => (
                        <span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                          <Hash className="w-2.5 h-2.5" />{kw.trim()}
                        </span>
                      ))}
                    </div>

                    {/* Response preview */}
                    <p className="text-xs text-gray-500 truncate">{trigger.response_message}</p>

                    <div className="flex items-center gap-3 mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        trigger.reply_type === 'private' ? 'bg-indigo-100 text-indigo-700' : 'bg-pink-100 text-pink-700'
                      }`}>
                        {trigger.reply_type === 'private' ? <><Mail className="w-3 h-3" /> DM</> : <><Globe className="w-3 h-3" /> Publica</>}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {trigger.trigger_source === 'comments' ? 'Comentarios' : trigger.trigger_source === 'story_replies' ? 'Stories' : 'Ambos'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {trigger.trigger_count || 0} veces
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Panel derecho: formulario o info */}
          <div className={`${triggerForm ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-gray-50`}>
            {triggerForm ? (
              <div className="p-6 max-w-lg mx-auto w-full">
                <div className="flex items-center gap-2 mb-6">
                  <button
                    onClick={() => setTriggerForm(null)}
                    className="md:hidden p-1 text-gray-400 hover:text-gray-600"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <Zap className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-bold text-gray-800">
                    {triggerForm.id ? 'Editar Trigger' : 'Nuevo Trigger'}
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={triggerForm.name}
                      onChange={e => setTriggerForm({ ...triggerForm, name: e.target.value })}
                      placeholder="Ej: Enviar precio"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Palabras clave <span className="text-gray-400 font-normal">(separadas por coma)</span>
                    </label>
                    <input
                      type="text"
                      value={triggerForm.keywords}
                      onChange={e => setTriggerForm({ ...triggerForm, keywords: e.target.value })}
                      placeholder="Ej: precio, cuanto cuesta, costo, info"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                    />
                    <p className="text-xs text-gray-400 mt-1">Si el comentario contiene alguna de estas palabras, se activa el trigger</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje de respuesta</label>
                    <textarea
                      value={triggerForm.response_message}
                      onChange={e => setTriggerForm({ ...triggerForm, response_message: e.target.value })}
                      placeholder="Ej: Hola! Te envio la info por DM. Nuestros precios son..."
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de respuesta</label>
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                        <button
                          onClick={() => setTriggerForm({ ...triggerForm, reply_type: 'private' })}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                            triggerForm.reply_type === 'private' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                          }`}
                        >
                          <Mail className="w-3 h-3" /> DM
                        </button>
                        <button
                          onClick={() => setTriggerForm({ ...triggerForm, reply_type: 'public' })}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                            triggerForm.reply_type === 'public' ? 'bg-white text-pink-600 shadow-sm' : 'text-gray-500'
                          }`}
                        >
                          <Globe className="w-3 h-3" /> Publica
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Coincidencia</label>
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                        <button
                          onClick={() => setTriggerForm({ ...triggerForm, match_type: 'contains' })}
                          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                            triggerForm.match_type === 'contains' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                          }`}
                        >
                          Contiene
                        </button>
                        <button
                          onClick={() => setTriggerForm({ ...triggerForm, match_type: 'exact' })}
                          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                            triggerForm.match_type === 'exact' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                          }`}
                        >
                          Exacto
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Aplica a</label>
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setTriggerForm({ ...triggerForm, trigger_source: 'comments' })}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                          triggerForm.trigger_source === 'comments' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        Comentarios
                      </button>
                      <button
                        onClick={() => setTriggerForm({ ...triggerForm, trigger_source: 'story_replies', reply_type: 'private' })}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                          triggerForm.trigger_source === 'story_replies' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        Stories
                      </button>
                      <button
                        onClick={() => setTriggerForm({ ...triggerForm, trigger_source: 'both' })}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                          triggerForm.trigger_source === 'both' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        Ambos
                      </button>
                    </div>
                    {triggerForm.trigger_source === 'story_replies' && (
                      <p className="text-xs text-orange-500 mt-1">Las respuestas a stories solo permiten DM privado</p>
                    )}
                  </div>

                  {triggerForm.reply_type === 'private' && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                      <p className="text-xs text-indigo-600">
                        <strong>DM Privado:</strong> Instagram permite 1 solo mensaje privado por comentario, dentro de los 7 dias del comentario.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={saveTrigger}
                      className="flex-1 px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition"
                    >
                      {triggerForm.id ? 'Guardar cambios' : 'Crear trigger'}
                    </button>
                    <button
                      onClick={() => setTriggerForm(null)}
                      className="px-4 py-2 bg-gray-100 text-gray-600 font-medium rounded-lg hover:bg-gray-200 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <Zap className="w-16 h-16 mb-4 text-amber-300" />
                <p className="text-lg font-medium text-gray-500">Comment Triggers</p>
                <p className="text-sm mt-1 text-center px-8">
                  Responde automaticamente por DM cuando alguien comenta una palabra clave en tus posts
                </p>
                <button
                  onClick={() => setTriggerForm({ name: '', keywords: '', response_message: '', reply_type: 'private', match_type: 'contains', trigger_source: 'both' })}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition"
                >
                  <Plus className="w-4 h-4" /> Crear primer trigger
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
      /* ═══ Vista Comentarios ═══ */
      <div className="flex-1 flex overflow-hidden">
      {/* Panel izquierdo: Lista de posts */}
      <div className={`${(selectedPost || selectedCommenter) ? 'hidden md:flex' : 'flex'} w-full md:w-96 flex-col border-r border-gray-200 bg-white`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <InstagramIcon className="w-5 h-5 text-pink-500" />
              <h1 className="text-lg font-bold text-gray-800">Comentarios</h1>
              {totalUnreplied > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {totalUnreplied}
                </span>
              )}
            </div>
            <button
              onClick={() => { setLoading(true); groupBy === 'posts' ? loadPosts() : loadCommenters() }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Toggle Por Post / Por Cliente */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => { setGroupBy('posts'); setSelectedCommenter(null); setComments([]) }}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                groupBy === 'posts' ? 'bg-white text-pink-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              <ImageIcon className="w-3 h-3" /> Por Post
            </button>
            <button
              onClick={() => { setGroupBy('commenters'); setSelectedPost(null); setComments([]) }}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                groupBy === 'commenters' ? 'bg-white text-pink-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              <Users className="w-3 h-3" /> Por Cliente
            </button>
          </div>
        </div>

        {/* Lista de posts / commenters */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-gray-300 animate-spin" />
            </div>
          ) : groupBy === 'posts' && posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 px-4">
              <MessageCircle className="w-12 h-12 mb-3" />
              <p className="text-center">No hay comentarios todavia</p>
              <p className="text-xs text-center mt-1">Los comentarios de Instagram apareceran aqui</p>
            </div>
          ) : groupBy === 'commenters' && commenters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 px-4">
              <Users className="w-12 h-12 mb-3" />
              <p className="text-center">No hay comentaristas todavia</p>
              <p className="text-xs text-center mt-1">Los usuarios que comentan apareceran aqui</p>
            </div>
          ) : groupBy === 'commenters' ? (
            commenters.map(commenter => (
              <button
                key={commenter.from_id}
                onClick={() => setSelectedCommenter(commenter)}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition ${
                  selectedCommenter?.from_id === commenter.from_id ? 'bg-pink-50 border-l-4 border-l-pink-500' : ''
                }`}
              >
                <div className="flex gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-bold">
                      {(commenter.from_username || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      @{commenter.from_username || commenter.from_id}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">
                        {commenter.comment_count} comentario{commenter.comment_count != 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-gray-400">
                        en {commenter.posts_count} post{commenter.posts_count != 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {parseInt(commenter.unreplied_count) > 0 && (
                        <span className="text-xs font-medium text-red-500">
                          {commenter.unreplied_count} sin responder
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {timeAgo(commenter.last_comment_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          ) : (
            posts.map(post => (
              <button
                key={post.media_id}
                onClick={() => setSelectedPost(post)}
                className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition ${
                  selectedPost?.media_id === post.media_id ? 'bg-pink-50 border-l-4 border-l-pink-500' : ''
                }`}
              >
                <div className="flex gap-3">
                  {/* Thumbnail */}
                  {post.media_url ? (
                    <img
                      src={post.media_url}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center flex-shrink-0">
                      <InstagramIcon className="w-6 h-6 text-white" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MediaTypeBadge type={post.media_product_type} adId={post.ad_id} />
                      <span className="text-xs text-gray-400">
                        {timeAgo(post.last_comment_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 truncate">
                      {post.media_caption || (post.ad_title ? `Ad: ${post.ad_title}` : 'Sin caption')}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">
                        {post.comment_count} comentario{post.comment_count !== 1 ? 's' : ''}
                      </span>
                      {parseInt(post.unreplied_count) > 0 && (
                        <span className="text-xs font-medium text-red-500">
                          {post.unreplied_count} sin responder
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Panel derecho: Comentarios del post seleccionado */}
      <div className={`${(selectedPost || selectedCommenter) ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-gray-50`}>
        {(selectedPost || selectedCommenter) ? (
          <>
            {/* Header del post */}
            <div className="p-4 bg-white border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSelectedPost(null); setSelectedCommenter(null); setComments([]) }}
                  className="md:hidden p-1 text-gray-400 hover:text-gray-600"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {selectedCommenter ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <span className="text-white font-bold">
                        {(selectedCommenter.from_username || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        @{selectedCommenter.from_username || selectedCommenter.from_id}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {selectedCommenter.comment_count} comentarios en {selectedCommenter.posts_count} posts
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {selectedPost.media_url ? (
                      <img src={selectedPost.media_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                        <InstagramIcon className="w-5 h-5 text-white" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MediaTypeBadge type={selectedPost.media_product_type} adId={selectedPost.ad_id} />
                        {selectedPost.ad_title && (
                          <span className="text-xs text-amber-600 font-medium truncate">{selectedPost.ad_title}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate mt-0.5">
                        {selectedPost.media_caption || 'Sin caption'}
                      </p>
                    </div>

                    {selectedPost.media_permalink && (
                      <a
                        href={selectedPost.media_permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-lg transition"
                        title="Ver en Instagram"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </>
                )}
              </div>

              {/* Filtros */}
              <div className="flex gap-2 mt-3">
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'unreplied', label: 'Sin responder' },
                  { key: 'replied', label: 'Respondidos' }
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      filter === f.key
                        ? 'bg-pink-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de comentarios */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                  <MessageCircle className="w-8 h-8 mb-2" />
                  <p className="text-sm">No hay comentarios con este filtro</p>
                </div>
              ) : (
                comments.map(comment => (
                  <div
                    key={comment.comment_id}
                    className={`bg-white rounded-xl p-4 shadow-sm border ${
                      comment.hidden ? 'opacity-50 border-gray-200' :
                      comment.replied ? 'border-green-200' : 'border-pink-200'
                    }`}
                  >
                    {/* Header del comentario */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                          <span className="text-white text-xs font-bold">
                            {(comment.from_username || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-800">
                            @{comment.from_username || comment.from_id}
                          </span>
                          {comment.parent_comment_id && (
                            <span className="text-xs text-gray-400 ml-2">respuesta</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">
                          {timeAgo(comment.created_at)}
                        </span>
                        {comment.replied ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-orange-400" />
                        )}
                      </div>
                    </div>

                    {/* Texto del comentario */}
                    <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">{comment.text}</p>

                    {/* Respuesta existente */}
                    {comment.replied && comment.reply_text && (
                      <div className={`rounded-lg p-3 mb-2 border ${
                        comment.reply_text.startsWith('[DM]')
                          ? 'bg-indigo-50 border-indigo-100'
                          : 'bg-green-50 border-green-100'
                      }`}>
                        <div className="flex items-center gap-1 mb-1">
                          {comment.reply_text.startsWith('[DM]') ? (
                            <Mail className="w-3 h-3 text-indigo-500" />
                          ) : (
                            <CheckCircle className="w-3 h-3 text-green-500" />
                          )}
                          <span className={`text-xs font-medium ${
                            comment.reply_text.startsWith('[DM]') ? 'text-indigo-600' : 'text-green-600'
                          }`}>
                            {comment.reply_text.startsWith('[DM]') ? 'DM enviado' : 'Respondido'} por {comment.replied_by}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">
                            {comment.replied_at ? timeAgo(comment.replied_at) : ''}
                          </span>
                        </div>
                        <p className={`text-sm ${
                          comment.reply_text.startsWith('[DM]') ? 'text-indigo-800' : 'text-green-800'
                        }`}>
                          {comment.reply_text.startsWith('[DM]') ? comment.reply_text.slice(5) : comment.reply_text}
                        </p>
                      </div>
                    )}

                    {/* Input de respuesta */}
                    {replyingTo === comment.comment_id && (
                      <div className="mt-2 space-y-2">
                        {/* Toggle público/privado */}
                        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
                          <button
                            onClick={() => setReplyMode('public')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                              replyMode === 'public' ? 'bg-white text-pink-600 shadow-sm' : 'text-gray-500'
                            }`}
                          >
                            <Globe className="w-3 h-3" /> Publica
                          </button>
                          <button
                            onClick={() => setReplyMode('private')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                              replyMode === 'private' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                            }`}
                          >
                            <Mail className="w-3 h-3" /> Privada (DM)
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleReply(comment.comment_id)}
                            placeholder={replyMode === 'private' ? 'Mensaje privado al usuario...' : 'Respuesta publica...'}
                            className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none transition ${
                              replyMode === 'private'
                                ? 'border-indigo-200 focus:border-indigo-400 bg-indigo-50/50'
                                : 'border-gray-200 focus:border-pink-400'
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => handleReply(comment.comment_id)}
                            disabled={!replyText.trim() || sending}
                            className={`px-3 py-2 text-white rounded-lg disabled:opacity-50 transition ${
                              replyMode === 'private'
                                ? 'bg-indigo-500 hover:bg-indigo-600'
                                : 'bg-pink-500 hover:bg-pink-600'
                            }`}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                        {replyMode === 'private' && (
                          <p className="text-xs text-indigo-400">Solo 1 mensaje privado por comentario, dentro de 7 dias</p>
                        )}
                      </div>
                    )}

                    {/* Acciones */}
                    <div className="flex items-center gap-1 mt-2">
                      {!comment.replied && (
                        <button
                          onClick={() => {
                            setReplyingTo(replyingTo === comment.comment_id ? null : comment.comment_id)
                            setReplyText('')
                            setReplyMode('public')
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-pink-600 hover:bg-pink-50 rounded transition"
                        >
                          <MessageCircle className="w-3 h-3" />
                          Responder
                        </button>
                      )}
                      <button
                        onClick={() => handleHide(comment.comment_id, !comment.hidden)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition"
                      >
                        {comment.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {comment.hidden ? 'Mostrar' : 'Ocultar'}
                      </button>
                      <button
                        onClick={() => handleDelete(comment.comment_id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition"
                      >
                        <Trash2 className="w-3 h-3" />
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <InstagramIcon className="w-16 h-16 mb-4 text-pink-300" />
            <p className="text-lg font-medium text-gray-500">Comentarios de Instagram</p>
            <p className="text-sm mt-1">
              {groupBy === 'posts' ? 'Selecciona un post para ver sus comentarios' : 'Selecciona un cliente para ver sus comentarios'}
            </p>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  )
}
