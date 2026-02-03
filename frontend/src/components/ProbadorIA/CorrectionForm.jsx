import { useState } from 'react'
import { Check, X } from 'lucide-react'

export default function CorrectionForm({ onSubmit, onCancel, submitting }) {
  const [correctionType, setCorrectionType] = useState('factual')
  const [correctedAnswer, setCorrectedAnswer] = useState('')
  const [behavioralRule, setBehavioralRule] = useState('')

  const handleSubmit = () => {
    if (correctionType === 'factual') {
      if (!correctedAnswer.trim()) return
      onSubmit({ type: 'factual', content: correctedAnswer.trim() })
    } else {
      if (!behavioralRule.trim()) return
      onSubmit({ type: 'behavioral', content: behavioralRule.trim() })
    }
  }

  const isValid = correctionType === 'factual'
    ? correctedAnswer.trim().length > 0
    : behavioralRule.trim().length > 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
      {/* Type toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setCorrectionType('factual')}
          className={`flex-1 text-[11px] font-medium py-1.5 px-3 rounded-lg transition ${
            correctionType === 'factual'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Respuesta incorrecta
        </button>
        <button
          onClick={() => setCorrectionType('behavioral')}
          className={`flex-1 text-[11px] font-medium py-1.5 px-3 rounded-lg transition ${
            correctionType === 'behavioral'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Regla de comportamiento
        </button>
      </div>

      {/* Factual correction form */}
      {correctionType === 'factual' && (
        <div>
          <textarea
            value={correctedAnswer}
            onChange={e => setCorrectedAnswer(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            placeholder="Cual es la respuesta correcta?"
            autoFocus
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Esto creara un nuevo par Q&A aprobado
          </p>
        </div>
      )}

      {/* Behavioral rule form */}
      {correctionType === 'behavioral' && (
        <div>
          <textarea
            value={behavioralRule}
            onChange={e => setBehavioralRule(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
            placeholder="Ej: Nunca ofrezcas descuentos sin autorizacion"
            autoFocus
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Esta regla se agregara a las instrucciones permanentes
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSubmit}
          disabled={submitting || !isValid}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition disabled:opacity-50 ${
            correctionType === 'factual'
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-purple-600 hover:bg-purple-700'
          }`}
        >
          <Check className="w-3 h-3" />
          {submitting ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50 transition"
        >
          <X className="w-3 h-3" />
          Cancelar
        </button>
      </div>
    </div>
  )
}
