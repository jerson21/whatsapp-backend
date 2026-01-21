import { useState, useRef, useEffect } from 'react'
import { useFlowStore } from '../store/flowStore'

export default function ChatSimulator({ isOpen, onClose }) {
  const { nodes, edges, flowName } = useFlowStore()
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [currentNodeId, setCurrentNodeId] = useState(null)
  const [variables, setVariables] = useState({})
  const [isWaitingForInput, setIsWaitingForInput] = useState(false)
  const [highlightedNodeId, setHighlightedNodeId] = useState(null)
  const [mode, setMode] = useState('local') // 'local' | 'server'
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Start simulation when opened
  useEffect(() => {
    if (isOpen) {
      resetSimulation()
    }
  }, [isOpen])

  const resetSimulation = () => {
    setMessages([
      { type: 'system', text: `Simulando flujo: "${flowName}"` },
      { type: 'system', text: 'Escribe un mensaje para iniciar...' }
    ])
    setVariables({})
    setCurrentNodeId(null)
    setIsWaitingForInput(true)
    setHighlightedNodeId(null)
  }

  const findNode = (nodeId) => nodes.find(n => n.id === nodeId)

  const findNextNode = (fromNodeId, condition = null) => {
    const edge = edges.find(e => {
      if (e.source !== fromNodeId) return false
      if (condition && e.label && e.label !== condition) return false
      return true
    })
    return edge ? findNode(edge.target) : null
  }

  const findTriggerNode = () => nodes.find(n => n.type === 'trigger')

  const processNode = async (node) => {
    if (!node) {
      addMessage('system', '⚠️ Flujo terminado (no hay siguiente nodo)')
      setIsWaitingForInput(true)
      return
    }

    setHighlightedNodeId(node.id)
    setCurrentNodeId(node.id)

    // Add small delay for visual feedback
    await delay(300)

    switch (node.type) {
      case 'trigger':
        addMessage('system', `⚡ Trigger activado`)
        const afterTrigger = findNextNode(node.id)
        processNode(afterTrigger)
        break

      case 'message':
        const messageText = replaceVariables(node.data.content || 'Mensaje vacío')
        addMessage('bot', messageText)
        await delay(500)
        const afterMessage = findNextNode(node.id)
        processNode(afterMessage)
        break

      case 'question':
        const questionText = replaceVariables(node.data.content || '¿?')
        addMessage('bot', questionText)

        // Show options if available
        if (node.data.options && node.data.options.length > 0) {
          addMessage('options', node.data.options)
        }

        setIsWaitingForInput(true)
        // Store which variable to save the answer to
        setCurrentNodeId(node.id)
        break

      case 'condition':
        addMessage('system', `🔀 Evaluando condición...`)
        await delay(300)

        // Simple condition evaluation
        const conditions = node.data.conditions || []
        let nextNodeId = null

        for (const cond of conditions) {
          if (cond.else) {
            nextNodeId = cond.goto
            break
          }
          // Simple evaluation: variable == value
          const match = cond.if?.match(/(\w+)\s*==\s*["']?(\w+)["']?/)
          if (match) {
            const [, varName, expectedValue] = match
            if (variables[varName] === expectedValue) {
              nextNodeId = cond.goto
              addMessage('system', `✓ Condición cumplida: ${varName} = ${expectedValue}`)
              break
            }
          }
        }

        const conditionNext = findNode(nextNodeId) || findNextNode(node.id)
        processNode(conditionNext)
        break

      case 'action':
        addMessage('system', `⚙️ Ejecutando acción: ${node.data.action || 'sin definir'}`)
        await delay(500)
        const afterAction = findNextNode(node.id)
        processNode(afterAction)
        break

      case 'ai_response':
        // Simulate AI response
        addMessage('system', `🧠 Generando respuesta con IA...`)
        setIsTyping(true)
        await delay(1500) // Simulate AI processing time
        setIsTyping(false)

        // Generate simulated response based on prompts
        const systemPrompt = node.data.system_prompt || ''
        const userPrompt = replaceVariables(node.data.user_prompt || '')
        const simulatedAI = `[Respuesta IA simulada]\n${systemPrompt.substring(0, 50)}...\nPara: "${userPrompt.substring(0, 50)}..."`
        addMessage('bot', simulatedAI)

        // Save to variable if specified
        if (node.data.variable) {
          setVariables(prev => ({
            ...prev,
            [node.data.variable]: 'respuesta_ia_simulada'
          }))
          addMessage('system', `📝 Variable "${node.data.variable}" = respuesta IA`)
        }

        await delay(300)
        const afterAI = findNextNode(node.id)
        processNode(afterAI)
        break

      case 'webhook':
        // Simulate webhook call
        addMessage('system', `🌐 Llamando webhook: ${node.data.url || 'URL no definida'}`)
        addMessage('system', `   Método: ${node.data.method || 'POST'}`)
        setIsTyping(true)
        await delay(1000) // Simulate API call
        setIsTyping(false)

        // Simulate response
        const webhookResult = { success: true, data: { status: 'ok', simulated: true } }
        addMessage('system', `✓ Webhook respondió: ${JSON.stringify(webhookResult).substring(0, 50)}...`)

        // Save to variable if specified
        if (node.data.variable) {
          setVariables(prev => ({
            ...prev,
            [node.data.variable]: webhookResult
          }))
        }

        const afterWebhook = findNextNode(node.id)
        processNode(afterWebhook)
        break

      case 'delay':
        // Simulate delay with typing indicator
        const delaySeconds = node.data.seconds || 2
        const showTyping = node.data.typing_indicator !== false

        addMessage('system', `⏱️ Esperando ${delaySeconds} segundos...`)

        if (showTyping) {
          setIsTyping(true)
        }

        await delay(delaySeconds * 1000)

        if (showTyping) {
          setIsTyping(false)
        }

        const afterDelay = findNextNode(node.id)
        processNode(afterDelay)
        break

      case 'transfer':
        addMessage('bot', node.data.content || 'Transfiriendo a un agente...')
        addMessage('system', '👤 Conversación transferida a humano')
        setIsWaitingForInput(true)
        break

      case 'end':
        addMessage('system', '🏁 Flujo completado')
        setIsWaitingForInput(true)
        break

      default:
        addMessage('system', `Nodo desconocido: ${node.type}`)
        const defaultNext = findNextNode(node.id)
        processNode(defaultNext)
    }
  }

  const replaceVariables = (text) => {
    if (!text) return text
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] || match
    })
  }

  const addMessage = (type, content) => {
    setMessages(prev => [...prev, { type, text: content, time: new Date() }])
  }

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  const handleSend = () => {
    if (!inputValue.trim()) return

    const userMessage = inputValue.trim()
    setInputValue('')
    addMessage('user', userMessage)
    setIsWaitingForInput(false)

    // If we're at a question node, save the answer
    const currentNode = findNode(currentNodeId)
    if (currentNode?.type === 'question' && currentNode.data.variable) {
      // If options exist, try to match
      let valueToSave = userMessage
      if (currentNode.data.options) {
        const matchedOption = currentNode.data.options.find(
          opt => opt.label.toLowerCase() === userMessage.toLowerCase() ||
                 opt.value === userMessage
        )
        if (matchedOption) {
          valueToSave = matchedOption.value
        }
      }

      setVariables(prev => ({
        ...prev,
        [currentNode.data.variable]: valueToSave
      }))
      addMessage('system', `📝 Variable "${currentNode.data.variable}" = "${valueToSave}"`)

      // Continue to next node
      setTimeout(() => {
        const nextNode = findNextNode(currentNodeId)
        processNode(nextNode)
      }, 300)
    } else if (!currentNodeId) {
      // First message - start from trigger
      const trigger = findTriggerNode()
      if (trigger) {
        processNode(trigger)
      } else {
        addMessage('system', '⚠️ No hay nodo Trigger en el flujo')
      }
    }
  }

  const handleOptionClick = (option) => {
    setInputValue(option.label)
    setTimeout(() => handleSend(), 100)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      width: '380px',
      height: '550px',
      background: 'white',
      borderRadius: '16px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)',
        color: 'white',
        padding: '12px 16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>🧪 Simulador de Chat</div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Prueba tu flujo aquí</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={resetSimulation}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              🔄
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '0 4px'
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '4px' }}>
          <button
            onClick={() => setMode('local')}
            style={{
              flex: 1,
              background: mode === 'local' ? 'white' : 'transparent',
              color: mode === 'local' ? '#075E54' : 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: mode === 'local' ? 600 : 400
            }}
          >
            Local
          </button>
          <button
            onClick={() => setMode('server')}
            style={{
              flex: 1,
              background: mode === 'server' ? 'white' : 'transparent',
              color: mode === 'server' ? '#075E54' : 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: mode === 'server' ? 600 : 400
            }}
          >
            Servidor
          </button>
        </div>
      </div>

      {/* Variables panel */}
      {Object.keys(variables).length > 0 && (
        <div style={{
          background: '#f0fdf4',
          padding: '8px 16px',
          fontSize: '11px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <strong>Variables:</strong>{' '}
          {Object.entries(variables).map(([k, v]) => (
            <span key={k} style={{
              background: '#dcfce7',
              padding: '2px 6px',
              borderRadius: '4px',
              marginLeft: '4px'
            }}>
              {k}={typeof v === 'object' ? JSON.stringify(v).substring(0, 30) + '...' : String(v)}
            </span>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        background: '#e5ddd5',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
      }}>
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} onOptionClick={handleOptionClick} />
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            marginBottom: '8px'
          }}>
            <div style={{
              background: 'white',
              padding: '12px 16px',
              borderRadius: '12px 12px 12px 0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              display: 'flex',
              gap: '4px'
            }}>
              <span className="typing-dot" style={{ width: '8px', height: '8px', background: '#90a3ae', borderRadius: '50%', animation: 'typing 1.4s infinite ease-in-out', animationDelay: '0s' }}></span>
              <span className="typing-dot" style={{ width: '8px', height: '8px', background: '#90a3ae', borderRadius: '50%', animation: 'typing 1.4s infinite ease-in-out', animationDelay: '0.2s' }}></span>
              <span className="typing-dot" style={{ width: '8px', height: '8px', background: '#90a3ae', borderRadius: '50%', animation: 'typing 1.4s infinite ease-in-out', animationDelay: '0.4s' }}></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px',
        background: '#f0f2f5',
        display: 'flex',
        gap: '8px'
      }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isWaitingForInput ? "Escribe un mensaje..." : "Esperando respuesta..."}
          disabled={!isWaitingForInput}
          style={{
            flex: 1,
            padding: '10px 16px',
            border: 'none',
            borderRadius: '24px',
            fontSize: '14px',
            outline: 'none'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!isWaitingForInput || !inputValue.trim()}
          style={{
            background: '#25D366',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            cursor: isWaitingForInput && inputValue.trim() ? 'pointer' : 'not-allowed',
            opacity: isWaitingForInput && inputValue.trim() ? 1 : 0.5,
            fontSize: '18px'
          }}
        >
          ➤
        </button>
      </div>
    </div>
  )
}

function MessageBubble({ message, onOptionClick }) {
  const { type, text } = message

  // Helper to safely render text (handles objects)
  const renderText = (t) => {
    if (typeof t === 'object' && t !== null) {
      return JSON.stringify(t, null, 2)
    }
    return String(t)
  }

  if (type === 'system') {
    return (
      <div style={{
        textAlign: 'center',
        margin: '8px 0',
        fontSize: '11px',
        color: '#667781',
        background: 'rgba(255,255,255,0.8)',
        padding: '4px 12px',
        borderRadius: '8px',
        display: 'inline-block',
        width: '100%'
      }}>
        {renderText(text)}
      </div>
    )
  }

  if (type === 'options') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0' }}>
        {text.map((opt, idx) => (
          <button
            key={idx}
            onClick={() => onOptionClick(opt)}
            style={{
              background: 'white',
              border: '1px solid #25D366',
              color: '#25D366',
              padding: '8px 16px',
              borderRadius: '16px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    )
  }

  const isUser = type === 'user'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '8px'
    }}>
      <div style={{
        maxWidth: '80%',
        padding: '8px 12px',
        borderRadius: isUser ? '12px 12px 0 12px' : '12px 12px 12px 0',
        background: isUser ? '#dcf8c6' : 'white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        fontSize: '14px',
        lineHeight: '1.4',
        whiteSpace: 'pre-wrap'
      }}>
        {renderText(text)}
      </div>
    </div>
  )
}
