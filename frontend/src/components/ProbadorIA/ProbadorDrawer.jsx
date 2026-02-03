import { useState, useEffect, useRef } from 'react'
import { X, Play, Zap, RefreshCw } from 'lucide-react'
import { simulateChatMessage, quickCorrectFromTester, createBehavioralRule } from '../../api/learning'
import ChatPanel from './ChatPanel'
import RayosXPanel from './RayosXPanel'

export default function ProbadorDrawer({ show, onClose }) {
  const [showRayosX, setShowRayosX] = useState(false)
  const [activeXrayTab, setActiveXrayTab] = useState('pipeline')
  const [testerMessages, setTesterMessages] = useState([])
  const [testerInput, setTesterInput] = useState('')
  const [testerLoading, setTesterLoading] = useState(false)
  const [testerPhone, setTesterPhone] = useState(() => `tester_admin_${Date.now()}`)
  const [currentTrace, setCurrentTrace] = useState(null)
  const [knowledgeStats, setKnowledgeStats] = useState(null)
  const [sessionCorrections, setSessionCorrections] = useState([])
  const [correcting, setCorrecting] = useState(null)
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false)
  const testerEndRef = useRef(null)

  useEffect(() => {
    if (testerEndRef.current) {
      testerEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [testerMessages, testerLoading])

  const sendTesterMessage = async () => {
    const text = testerInput.trim()
    if (!text || testerLoading) return
    setTesterInput('')
    setTesterMessages(prev => [...prev, { role: 'user', text, time: new Date() }])
    setTesterLoading(true)
    setCurrentTrace(null)
    try {
      const data = await simulateChatMessage(testerPhone, text, showRayosX)
      const responses = data.responses || []
      const trace = data.trace || null
      if (responses.length > 0) {
        setTesterMessages(prev => [
          ...prev,
          ...responses.map(r => ({
            role: 'bot',
            text: r,
            time: new Date(),
            trace,
            corrected: false,
            correctionType: null
          }))
        ])
      } else {
        setTesterMessages(prev => [
          ...prev,
          { role: 'bot', text: '(sin respuesta del bot)', time: new Date(), trace }
        ])
      }
      if (trace) {
        setCurrentTrace(trace)
        // Build knowledge stats from trace data for the summary bar
        const ai = trace.aiFallback || {}
        const prompt = ai.prompt || {}
        const openaiCall = ai.openaiCall || {}
        setKnowledgeStats({
          approvedPairs: prompt.knowledgePairsInjected || 0,
          activePrices: ai.priceQuery?.pricesFound?.length || 0,
          behavioralRules: prompt.behavioralRulesCount || 0,
          instructionsChars: prompt.totalSystemPromptChars || 0,
          model: openaiCall.model || 'unknown',
          fidelityLevel: prompt.fidelityLevel || 'enhanced',
          temperature: openaiCall.temperature || 0.5
        })
      }
    } catch (err) {
      setTesterMessages(prev => [
        ...prev,
        { role: 'system', text: 'Error: ' + err.message, time: new Date() }
      ])
    } finally {
      setTesterLoading(false)
    }
  }

  const resetTester = () => {
    setTesterMessages([])
    setTesterPhone(`tester_admin_${Date.now()}`)
    setCurrentTrace(null)
    setKnowledgeStats(null)
    setSessionCorrections([])
    setCorrecting(null)
  }

  const handleSubmitCorrection = async (index, { type, content }) => {
    setCorrectionSubmitting(true)
    try {
      if (type === 'factual') {
        // Find the preceding user message to use as the question
        let userQuestion = ''
        for (let i = index - 1; i >= 0; i--) {
          if (testerMessages[i].role === 'user') {
            userQuestion = testerMessages[i].text
            break
          }
        }
        await quickCorrectFromTester(userQuestion, content)
        setTesterMessages(prev => prev.map((m, i) =>
          i === index ? { ...m, corrected: true, correctionType: 'factual' } : m
        ))
        setSessionCorrections(prev => [...prev, {
          type: 'factual',
          index,
          question: userQuestion,
          correctedAnswer: content,
          time: new Date()
        }])
      } else {
        // Create behavioral rule
        await createBehavioralRule({ rule: content })
        setTesterMessages(prev => prev.map((m, i) =>
          i === index ? { ...m, corrected: true, correctionType: 'behavioral' } : m
        ))
        setSessionCorrections(prev => [...prev, {
          type: 'behavioral',
          index,
          rule: content,
          time: new Date()
        }])
      }
      setCorrecting(null)
    } catch (err) {
      console.error('Error submitting correction:', err)
    } finally {
      setCorrectionSubmitting(false)
    }
  }

  const handleRetest = async (index) => {
    // Find the user message that triggered this bot response
    let userText = ''
    for (let i = index - 1; i >= 0; i--) {
      if (testerMessages[i].role === 'user') {
        userText = testerMessages[i].text
        break
      }
    }
    if (!userText) return
    setTesterInput(userText)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer Panel */}
      <div
        className={`relative bg-white shadow-2xl flex flex-col h-full transition-all duration-500 ease-out ${
          showRayosX ? 'w-full max-w-[56rem]' : 'w-full max-w-md'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 text-white">
            <Play className="w-5 h-5" />
            <div>
              <h3 className="font-bold text-sm">Probador IA</h3>
              <p className="text-[10px] text-purple-200">Prueba tu prompt en tiempo real</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Rayos X toggle */}
            <button
              onClick={() => setShowRayosX(!showRayosX)}
              className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-full font-semibold transition-all ${
                showRayosX
                  ? 'bg-amber-400 text-amber-900 shadow-lg shadow-amber-400/30'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Rayos X
            </button>
            <button
              onClick={resetTester}
              className="text-[10px] bg-white/20 hover:bg-white/30 text-white px-2.5 py-1.5 rounded-full font-medium transition"
            >
              <span className="flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Nueva conv.
              </span>
            </button>
            <button onClick={onClose} className="p-1 text-white/70 hover:text-white rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chat column */}
          <div className={`flex flex-col ${showRayosX ? 'w-[400px] flex-shrink-0 border-r border-gray-200' : 'flex-1'}`}>
            <ChatPanel
              messages={testerMessages}
              input={testerInput}
              setInput={setTesterInput}
              loading={testerLoading}
              onSend={sendTesterMessage}
              onReset={resetTester}
              correcting={correcting}
              setCorrecting={setCorrecting}
              onSubmitCorrection={handleSubmitCorrection}
              submitting={correctionSubmitting}
              onRetest={handleRetest}
              endRef={testerEndRef}
            />
          </div>

          {/* Rayos X column */}
          {showRayosX && (
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
              <RayosXPanel
                activeTab={activeXrayTab}
                setActiveTab={setActiveXrayTab}
                trace={currentTrace}
                knowledgeStats={knowledgeStats}
                sessionCorrections={sessionCorrections}
                isLoading={testerLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
