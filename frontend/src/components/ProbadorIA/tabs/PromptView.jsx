import { useTranslation } from 'react-i18next'
import { FileText, Sparkles, Code, Info } from 'lucide-react'

function PromptSection({ label, labelColor, bgColor, textColor, content }) {
  if (!content) return null
  return (
    <div className="mb-4">
      <span className={`text-[10px] uppercase tracking-wider font-semibold ${labelColor} block mb-1.5`}>
        {label}
      </span>
      <pre className={`${bgColor} ${textColor} rounded-lg p-3 text-[11px] overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto`}>
        {content}
      </pre>
    </div>
  )
}

export default function PromptView({ trace }) {
  const { t } = useTranslation('learning')

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Code className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-sm text-gray-400">{t('probador.noPromptData')}</p>
      </div>
    )
  }

  const ai = trace.aiFallback || {}
  const prompt = ai.prompt || {}
  const openaiCall = ai.openaiCall || {}

  const estimatedTokens = prompt.estimatedTokens || '?'
  const totalChars = prompt.totalSystemPromptChars || '?'
  const model = openaiCall.model || '?'
  const msgCount = prompt.totalMessagesInArray || '?'

  // Full system prompt text (sent from backend when tracing)
  const systemPromptFull = prompt.systemPromptFull || null
  const behavioralRulesText = prompt.behavioralRulesText || null
  const customInstructionsText = prompt.customInstructionsText || null

  // OpenAI response
  const responseText = openaiCall.responseText || null

  return (
    <div className="p-4 overflow-y-auto">
      {/* Top badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
          ~{estimatedTokens} tokens
        </span>
        <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
          {totalChars} chars
        </span>
        <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
          {model}
        </span>
        <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
          {msgCount} msgs
        </span>
      </div>

      {/* Metadata pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {prompt.isCustomSystemPrompt && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
            {t('probador.customPrompt')}
          </span>
        )}
        {prompt.knowledgeInjected && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
            {t('probador.qaPairsCount', { count: prompt.knowledgePairsInjected })}
          </span>
        )}
        {prompt.pricesInjected && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
            {t('probador.plusPrices')}
          </span>
        )}
        {prompt.behavioralRulesInjected && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
            {t('probador.rulesCount', { count: prompt.behavioralRulesCount })}
          </span>
        )}
        {prompt.hasCustomInstructions && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
            {t('probador.plusAdminInstructions')}
          </span>
        )}
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
          {t('probador.fidelityLevel', { level: prompt.fidelityLevel || '?' })}
        </span>
      </div>

      {/* Full System Prompt */}
      <PromptSection
        label={t('probador.fullSystemPrompt')}
        labelColor="text-gray-400"
        bgColor="bg-gray-900"
        textColor="text-gray-100"
        content={systemPromptFull}
      />

      {/* Behavioral Rules (standalone section for visibility) */}
      {behavioralRulesText && (
        <PromptSection
          label={t('probador.behavioralRules')}
          labelColor="text-purple-400"
          bgColor="bg-purple-950"
          textColor="text-purple-100"
          content={behavioralRulesText}
        />
      )}

      {/* Custom Instructions (standalone section for visibility) */}
      {customInstructionsText && (
        <PromptSection
          label={t('probador.adminInstructions')}
          labelColor="text-yellow-400"
          bgColor="bg-yellow-950"
          textColor="text-yellow-100"
          content={customInstructionsText}
        />
      )}

      {/* OpenAI response */}
      {responseText && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500 flex items-center gap-1 mb-1.5">
            <Sparkles className="w-3 h-3" /> {t('probador.openaiResponse')}
          </span>
          <pre className="bg-emerald-950 text-emerald-100 rounded-lg p-3 text-[11px] overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed border border-emerald-800">
            {responseText}
          </pre>
          {openaiCall.durationMs && (
            <div className="flex gap-2 mt-2">
              <span className="text-[9px] text-gray-400">
                {openaiCall.durationMs}ms · {openaiCall.totalTokens || '?'} tokens · {openaiCall.finishReason || '?'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!systemPromptFull && !responseText && (
        <div className="text-center py-8">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">{t('probador.noPromptDataAvailable')}</p>
          <p className="text-[10px] text-gray-300 mt-1">{t('probador.enableRayosXHint')}</p>
        </div>
      )}
    </div>
  )
}
