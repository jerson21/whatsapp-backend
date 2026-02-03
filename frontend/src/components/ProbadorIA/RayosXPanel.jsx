import { Activity, Code, BookOpen, MessageSquare, Zap } from 'lucide-react'
import KnowledgeSummaryBar from './KnowledgeSummaryBar'
import PipelineView from './tabs/PipelineView'
import PromptView from './tabs/PromptView'
import KnowledgeView from './tabs/KnowledgeView'
import HistoryView from './tabs/HistoryView'

const TABS = [
  { id: 'pipeline', label: 'Pipeline', icon: Activity },
  { id: 'prompt', label: 'Prompt', icon: Code },
  { id: 'knowledge', label: 'Conocimiento', icon: BookOpen },
  { id: 'history', label: 'Historial', icon: MessageSquare }
]

export default function RayosXPanel({
  activeTab,
  setActiveTab,
  trace,
  knowledgeStats,
  sessionCorrections,
  isLoading
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Knowledge summary bar */}
      {knowledgeStats && (
        <KnowledgeSummaryBar stats={knowledgeStats} />
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white px-2 flex-shrink-0">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 transition ${
                isActive
                  ? 'border-amber-500 text-amber-700 bg-amber-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {!trace && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Zap className="w-10 h-10 text-amber-300 mb-3" />
            <p className="text-sm text-gray-400 font-medium">Envia un mensaje para ver el pipeline</p>
            <p className="text-xs text-gray-300 mt-1">El debug se activa con cada mensaje</p>
          </div>
        ) : (
          <>
            {activeTab === 'pipeline' && (
              <PipelineView trace={trace} isLoading={isLoading} />
            )}
            {activeTab === 'prompt' && (
              <PromptView trace={trace} />
            )}
            {activeTab === 'knowledge' && (
              <KnowledgeView trace={trace} sessionCorrections={sessionCorrections} />
            )}
            {activeTab === 'history' && (
              <HistoryView trace={trace} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
