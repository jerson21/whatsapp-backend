import { useState } from 'react'
import { Brain, ChevronDown, ChevronRight, BookOpen, DollarSign, Shield, FileText, Sparkles, Target } from 'lucide-react'

export default function KnowledgeSummaryBar({ stats, flashField }) {
  const [expanded, setExpanded] = useState(false)

  if (!stats) return null

  const {
    approvedPairs = 0,
    activePrices = 0,
    behavioralRules = 0,
    instructionsChars = 0,
    model = 'desconocido',
    fidelityLevel = 'medium',
    temperature = 0.4
  } = stats

  return (
    <div className="bg-amber-50 border-b border-amber-200 flex-shrink-0">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-100/50 transition"
      >
        <Brain className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span className="text-[11px] text-amber-800 font-medium flex-1 truncate">
          {approvedPairs} Q&A | {activePrices} Precios | {model} | temp {temperature}
        </span>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        }
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 grid grid-cols-3 gap-2">
          <div className="bg-white rounded-lg p-2 border border-amber-100">
            <div className="flex items-center gap-1 mb-0.5">
              <BookOpen className="w-3 h-3 text-indigo-500" />
              <span className="text-[9px] font-semibold text-gray-500 uppercase">Q&A</span>
            </div>
            <span className="text-sm font-bold text-gray-800">{approvedPairs}</span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-amber-100">
            <div className="flex items-center gap-1 mb-0.5">
              <DollarSign className="w-3 h-3 text-green-500" />
              <span className="text-[9px] font-semibold text-gray-500 uppercase">Precios</span>
            </div>
            <span className="text-sm font-bold text-gray-800">{activePrices}</span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-amber-100">
            <div className="flex items-center gap-1 mb-0.5">
              <Shield className="w-3 h-3 text-purple-500" />
              <span className="text-[9px] font-semibold text-gray-500 uppercase">Reglas</span>
            </div>
            <span className="text-sm font-bold text-gray-800">{behavioralRules}</span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-amber-100">
            <div className="flex items-center gap-1 mb-0.5">
              <FileText className="w-3 h-3 text-blue-500" />
              <span className="text-[9px] font-semibold text-gray-500 uppercase">Instrucciones</span>
            </div>
            <span className="text-sm font-bold text-gray-800">{instructionsChars} chars</span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-amber-100">
            <div className="flex items-center gap-1 mb-0.5">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span className="text-[9px] font-semibold text-gray-500 uppercase">Modelo</span>
            </div>
            <span className="text-[11px] font-bold text-gray-800">{model}</span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-amber-100">
            <div className="flex items-center gap-1 mb-0.5">
              <Target className="w-3 h-3 text-red-500" />
              <span className="text-[9px] font-semibold text-gray-500 uppercase">Fidelidad</span>
            </div>
            <span className="text-[11px] font-bold text-gray-800 capitalize">{fidelityLevel}</span>
          </div>
        </div>
      )}
    </div>
  )
}
