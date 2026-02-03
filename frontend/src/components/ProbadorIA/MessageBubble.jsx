import { PenLine, Check, RotateCcw, Shield } from 'lucide-react'
import CorrectionForm from './CorrectionForm'

export default function MessageBubble({
  message,
  index,
  correcting,
  onStartCorrection,
  onSubmitCorrection,
  onCancelCorrection,
  onRetest,
  submitting
}) {
  const { role, text, time, corrected, correctionType } = message

  // System messages
  if (role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] text-red-500 bg-red-50 px-3 py-1 rounded-full">{text}</span>
      </div>
    )
  }

  // User messages
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-indigo-600 text-white">
          <p className="text-sm whitespace-pre-wrap">{text}</p>
          <span className="text-[9px] opacity-50 block mt-1">
            {time instanceof Date
              ? time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
              : new Date(time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    )
  }

  // Bot messages
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%]">
        <div className="rounded-2xl px-4 py-2.5 bg-white text-gray-800 border border-gray-200 shadow-sm">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-purple-500 block mb-1">
            BOT IA
          </span>
          <p className="text-sm whitespace-pre-wrap">{text}</p>
          <div className="flex items-center justify-between mt-1.5 gap-3">
            <span className="text-[9px] opacity-50">
              {time instanceof Date
                ? time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
                : new Date(time).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <div className="flex items-center gap-2">
              {corrected && correctionType === 'factual' && (
                <span className="text-[9px] font-semibold text-green-600 flex items-center gap-0.5 bg-green-50 px-1.5 py-0.5 rounded-full">
                  <Check className="w-2.5 h-2.5" /> Corregido
                </span>
              )}
              {corrected && correctionType === 'behavioral' && (
                <span className="text-[9px] font-semibold text-purple-600 flex items-center gap-0.5 bg-purple-50 px-1.5 py-0.5 rounded-full">
                  <Shield className="w-2.5 h-2.5" /> Regla agregada
                </span>
              )}
              {corrected && (
                <button
                  onClick={() => onRetest(index)}
                  className="text-[9px] font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded-full transition"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Re-probar
                </button>
              )}
              {!corrected && (
                <button
                  onClick={() => onStartCorrection(index)}
                  className="text-[9px] font-semibold text-purple-600 hover:text-purple-800 flex items-center gap-0.5 transition"
                >
                  <PenLine className="w-2.5 h-2.5" /> Corregir
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Inline correction form */}
        {correcting === index && (
          <div className="mt-2">
            <CorrectionForm
              onSubmit={(correction) => onSubmitCorrection(index, correction)}
              onCancel={onCancelCorrection}
              submitting={submitting}
            />
          </div>
        )}
      </div>
    </div>
  )
}
