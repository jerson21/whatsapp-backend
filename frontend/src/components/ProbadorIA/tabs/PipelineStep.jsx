import { Check, Minus, Loader2, X, ChevronRight } from 'lucide-react'

const STATUS_STYLES = {
  completed: {
    circle: 'bg-green-50 text-green-600 border-green-200',
    icon: Check
  },
  skipped: {
    circle: 'bg-gray-50 text-gray-400 border-gray-200',
    icon: Minus
  },
  processing: {
    circle: 'bg-blue-100 text-blue-600 border-blue-200 animate-pulse',
    icon: Loader2
  },
  error: {
    circle: 'bg-red-50 text-red-600 border-red-200',
    icon: X
  }
}

export default function PipelineStep({
  step,
  expanded,
  onToggle,
  animationDelay = 0,
  children
}) {
  const { id, label, summary, timing, status, detail, icon: StepIcon } = step
  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.completed
  const StatusIcon = statusStyle.icon

  return (
    <div
      className="relative"
      style={{
        animation: `stepAppear 0.3s ease-out ${animationDelay}ms both`
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon circle */}
        <div
          className={`w-[30px] h-[30px] rounded-full border flex items-center justify-center flex-shrink-0 ${statusStyle.circle}`}
          style={status === 'processing' ? { animation: 'pulseGlow 2s ease-in-out infinite' } : {}}
        >
          {StepIcon ? (
            <StepIcon className="w-3.5 h-3.5" />
          ) : (
            <StatusIcon className={`w-3.5 h-3.5 ${status === 'processing' ? 'animate-spin' : ''}`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div
            className={`flex items-center gap-2 ${detail || children ? 'cursor-pointer' : ''}`}
            onClick={() => (detail || children) && onToggle(id)}
          >
            <span className="text-xs font-medium text-gray-700">{label}</span>
            {summary && (
              <span className="text-[10px] text-gray-400 truncate">{summary}</span>
            )}
            <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
              {timing !== undefined && timing !== null && (
                <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  {timing}ms
                </span>
              )}
              {(detail || children) && (
                <ChevronRight
                  className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${
                    expanded ? 'rotate-90' : ''
                  }`}
                />
              )}
            </div>
          </div>

          {/* Expanded detail */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              expanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'
            }`}
          >
            {detail && (
              <div className="bg-gray-50 rounded-lg p-2.5 text-[10px] font-mono text-gray-600 whitespace-pre-wrap break-all">
                {typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)}
              </div>
            )}
            {children && (
              <div className="pl-2 border-l-2 border-gray-100 space-y-2 mt-1">
                {children}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
