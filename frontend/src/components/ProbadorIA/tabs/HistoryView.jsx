import { Clock, MessageSquare } from 'lucide-react'

export default function HistoryView({ trace }) {
  const ai = trace?.aiFallback || {}
  const history = ai.conversationHistory || {}
  const turns = history.turns || []
  const turnsLoaded = history.turnsLoaded || turns.length

  if (!turns.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Clock className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-sm text-gray-400 font-medium">Sin historial de conversacion</p>
        <p className="text-xs text-gray-300 mt-1">Este es el primer mensaje de la sesion</p>
      </div>
    )
  }

  return (
    <div className="p-4 overflow-y-auto">
      {/* Summary */}
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-purple-500" />
        <span className="text-xs text-gray-600 font-medium">
          {turnsLoaded} turnos cargados como contexto
        </span>
      </div>

      {/* Mini chat bubbles */}
      <div className="space-y-2">
        {turns.map((turn, idx) => {
          const isIncoming = turn.direction === 'incoming' || turn.direction === 'in'
          const text = turn.text || ''

          return (
            <div
              key={idx}
              className={`flex ${isIncoming ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  isIncoming
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-purple-50 text-purple-800 border border-purple-200'
                }`}
              >
                {!isIncoming && (
                  <span className="text-[8px] font-semibold uppercase tracking-wider text-purple-500 block mb-0.5">
                    BOT
                  </span>
                )}
                <p className="text-[11px] whitespace-pre-wrap leading-relaxed">{text}</p>
                {turn.timestamp && (
                  <span className="text-[8px] opacity-40 block mt-0.5">
                    {new Date(turn.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
