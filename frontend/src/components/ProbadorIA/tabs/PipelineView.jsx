import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare, Shield, Zap, RefreshCw, Target,
  Brain, User, BookOpen, DollarSign, Clock,
  FileText, Sparkles, Check, Send, Loader2, GitBranch
} from 'lucide-react'
import PipelineStep from './PipelineStep'

/**
 * Builds pipeline steps from the REAL backend trace object.
 * Backend fields: trace.entry, trace.modeCheck, trace.globalKeyword,
 * trace.sessionState, trace.classification, trace.flowMatching, trace.aiFallback, trace.result
 */
function buildSteps(trace, t) {
  if (!trace) return []

  const steps = []

  // 1. Mensaje recibido
  steps.push({
    id: 'message_received',
    label: t('probador.messageReceived'),
    summary: trace.inputMessage
      ? `"${trace.inputMessage.slice(0, 40)}${trace.inputMessage.length > 40 ? '...' : ''}"`
      : '',
    timing: 0,
    status: 'completed',
    icon: MessageSquare,
    detail: trace.entry ? {
      phone: trace.entry.phone,
      channel: trace.entry.channel,
      sessionId: trace.entry.sessionId,
      sessionCreated: trace.sessionCreated
    } : null
  })

  // 2. Modo sesion
  const mc = trace.modeCheck
  steps.push({
    id: 'session_mode',
    label: t('probador.sessionMode'),
    summary: mc
      ? `${mc.mode} (${mc.modeSource}) → ${mc.outcome}`
      : 'automatic',
    timing: null,
    status: mc?.outcome === 'proceed' ? 'completed' : (mc ? 'error' : 'skipped'),
    icon: Shield,
    detail: mc || null
  })

  // 3. Keywords globales
  const gk = trace.globalKeyword
  steps.push({
    id: 'global_keywords',
    label: t('probador.globalKeywords'),
    summary: gk?.matched
      ? t('probador.matched', { keyword: gk.keyword, action: gk.action })
      : t('probador.noMatch'),
    timing: null,
    status: gk?.matched ? 'completed' : 'skipped',
    icon: Zap,
    detail: gk || null
  })

  // 4. Sesion activa
  const ss = trace.sessionState
  steps.push({
    id: 'active_session',
    label: t('probador.activeSession'),
    summary: ss?.hasActiveSession
      ? t('probador.flowAtNode', { flowId: ss.flowId, nodeId: ss.currentNodeId })
      : t('probador.noActiveFlow'),
    timing: null,
    status: ss?.hasActiveSession ? 'completed' : 'skipped',
    icon: RefreshCw,
    detail: ss || null
  })

  // 5. Clasificacion
  const cls = trace.classification
  steps.push({
    id: 'classification',
    label: t('probador.classification'),
    summary: cls?.ran
      ? `Intent: ${cls.intent?.type || 'unknown'} (${Math.round((cls.intent?.confidence || 0) * 100)}%) · ${cls.sentiment || 'neutral'} · Lead: ${cls.leadScore?.value || 0}`
      : t('probador.notExecuted'),
    timing: cls?.durationMs || null,
    status: cls?.ran ? 'completed' : 'skipped',
    icon: Target,
    expandable: true,
    detail: cls || null
  })

  // 6. Match flujos
  const fm = trace.flowMatching
  steps.push({
    id: 'flow_match',
    label: t('probador.flowMatch'),
    summary: fm
      ? `${fm.activeFlowCount || 0} ${t('common:nav.flows').toLowerCase()} · ${fm.outcome === 'flow_matched' ? `Match: ${fm.matchedFlow?.flowName}` : fm.outcome === 'default_used' ? t('probador.defaultUsed') : t('probador.noMatchToAI')}`
      : t('probador.notEvaluated'),
    timing: null,
    status: fm?.outcome === 'flow_matched' ? 'completed' : (fm?.outcome === 'no_match' ? 'skipped' : 'completed'),
    icon: GitBranch,
    expandable: !!(fm?.flowsEvaluated?.length),
    detail: fm ? {
      ...fm,
      flowsDetail: fm.flowsEvaluated?.map(f =>
        `${f.matched ? '✓' : '✗'} ${f.flowName} (${f.triggerType}) — ${f.reason || ''}`
      )
    } : null
  })

  // 7. AI Fallback (parent with children)
  const ai = trace.aiFallback
  if (ai) {
    const aiChildren = []

    // 7a. Contacto
    aiChildren.push({
      id: 'ai_contact',
      label: t('probador.contact'),
      summary: ai.userName ? `${ai.userName}` : t('probador.noName'),
      timing: null,
      status: 'completed',
      icon: User,
      detail: ai.contactFields || null
    })

    // 7b. Conocimiento
    const kn = ai.knowledge
    const pairsFound = kn ? (kn.vectorSearch?.results?.length || 0) + (kn.bm25Search?.resultsCount || 0) : 0
    aiChildren.push({
      id: 'ai_knowledge',
      label: t('probador.knowledgeLabel'),
      summary: kn
        ? `${kn.combinedCount || 0} ${t('probador.pairs')} (vector: ${kn.vectorSearch?.results?.length || 0}, BM25: ${kn.bm25Search?.resultsCount || 0})`
        : `0 ${t('probador.pairs')}`,
      timing: kn?.vectorSearch?.durationMs || null,
      status: pairsFound > 0 ? 'completed' : 'skipped',
      icon: BookOpen,
      expandable: pairsFound > 0,
      detail: kn ? {
        retrieverAvailable: kn.retrieverAvailable,
        vectorResults: kn.vectorSearch?.results || [],
        bm25Results: kn.bm25Search?.results || []
      } : null
    })

    // 7c. Precios
    const pq = ai.priceQuery
    aiChildren.push({
      id: 'ai_prices',
      label: t('probador.pricesLabel'),
      summary: pq
        ? (pq.isPriceQuery
          ? t('probador.pricesFoundSummary', { count: pq.pricesFound?.length || 0 })
          : t('probador.notPriceQuery'))
        : t('probador.notQueried'),
      timing: pq?.durationMs || null,
      status: pq?.pricesFound?.length > 0 ? 'completed' : 'skipped',
      icon: DollarSign,
      detail: pq || null
    })

    // 7d. Historial
    const hist = ai.conversationHistory
    aiChildren.push({
      id: 'ai_history',
      label: t('probador.historyLabel'),
      summary: hist
        ? t('probador.turns', { count: hist.turnsLoaded || 0 })
        : t('probador.turns', { count: 0 }),
      timing: null,
      status: hist?.turnsLoaded > 0 ? 'completed' : 'skipped',
      icon: Clock,
      detail: hist || null
    })

    // 7e. Prompt construido
    const pr = ai.prompt
    aiChildren.push({
      id: 'ai_prompt',
      label: t('probador.promptBuilt'),
      summary: pr
        ? `~${pr.estimatedTokens || '?'} tokens · ${pr.totalMessagesInArray || '?'} msgs${pr.knowledgeInjected ? ' ' + t('probador.plusKnowledge') : ''}${pr.behavioralRulesInjected ? ' ' + t('probador.plusRules') : ''}`
        : '',
      timing: null,
      status: 'completed',
      icon: FileText,
      expandable: true,
      detail: pr || null
    })

    // 7f. OpenAI
    const oc = ai.openaiCall
    aiChildren.push({
      id: 'ai_openai',
      label: 'OpenAI',
      summary: oc
        ? `${oc.model} · temp ${oc.temperature} · ${oc.durationMs}ms · ${oc.totalTokens || '?'} tokens`
        : t('probador.openaiWaiting'),
      timing: oc?.durationMs || null,
      status: oc ? 'completed' : 'processing',
      icon: Sparkles,
      expandable: !!oc,
      detail: oc ? {
        model: oc.model,
        temperature: oc.temperature,
        maxTokens: oc.maxTokens,
        durationMs: oc.durationMs,
        promptTokens: oc.promptTokens,
        completionTokens: oc.completionTokens,
        finishReason: oc.finishReason,
        responsePreview: oc.responseText?.slice(0, 200)
      } : null
    })

    // 7g. Delivery
    const dl = ai.delivery
    aiChildren.push({
      id: 'ai_delivery',
      label: t('probador.delivery'),
      summary: dl
        ? t('probador.msgsSent', { count: dl.splitInto })
        : '',
      timing: null,
      status: dl ? 'completed' : 'skipped',
      icon: Send,
      detail: dl || null
    })

    steps.push({
      id: 'ai_fallback',
      label: t('probador.aiFallback'),
      summary: trace.result?.totalPipelineMs ? t('probador.pipelineTotal', { ms: trace.result.totalPipelineMs }) : '',
      timing: trace.result?.totalPipelineMs || null,
      status: ai.error ? 'error' : 'completed',
      icon: Brain,
      detail: ai.error || null,
      children: aiChildren
    })
  }

  // If there's a result but no AI fallback (flow was executed, etc.)
  if (!ai && trace.result) {
    steps.push({
      id: 'result',
      label: t('probador.result'),
      summary: `${trace.result.type} · ${trace.result.responseSent ? t('probador.responseSent') : t('probador.noResponse2')}`,
      timing: trace.result.totalPipelineMs || null,
      status: trace.result.responseSent ? 'completed' : 'skipped',
      icon: Check,
      detail: trace.result
    })
  }

  return steps
}

function buildLoadingSteps(t) {
  return [
    { id: 'message_received', label: t('probador.messageReceived'), summary: '', timing: 0, status: 'completed', icon: MessageSquare },
    { id: 'session_mode', label: t('probador.sessionMode'), summary: t('probador.evaluating'), timing: null, status: 'processing', icon: Shield },
    { id: 'global_keywords', label: t('probador.globalKeywords'), summary: t('probador.searching'), timing: null, status: 'processing', icon: Zap },
    { id: 'active_session', label: t('probador.activeSession'), summary: t('probador.verifying'), timing: null, status: 'processing', icon: RefreshCw },
    { id: 'classification', label: t('probador.classification'), summary: t('probador.analyzing'), timing: null, status: 'processing', icon: Target },
    { id: 'ai_fallback', label: t('probador.aiFallback'), summary: t('probador.processing'), timing: null, status: 'processing', icon: Brain }
  ]
}

export default function PipelineView({ trace, isLoading }) {
  const { t } = useTranslation('learning')
  const [expandedSteps, setExpandedSteps] = useState(new Set())

  const toggleStep = (stepId) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }

  const steps = isLoading && !trace ? buildLoadingSteps(t) : buildSteps(trace, t)

  if (!steps.length && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Brain className="w-12 h-12 text-gray-200 mb-3" />
        <p className="text-sm text-gray-400 font-medium">{t('probador.sendMessageToSeePipeline')}</p>
        <p className="text-[10px] text-gray-300 mt-1">{t('probador.eachStepShownHere')}</p>
      </div>
    )
  }

  return (
    <div className="p-4 overflow-y-auto flex-1">
      {/* Total timing */}
      {trace?.result?.totalPipelineMs && (
        <div className="mb-4 flex items-center gap-2 text-[10px]">
          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-semibold">
            {t('probador.pipelineTotal', { ms: trace.result.totalPipelineMs })}
          </span>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
            {trace.result.type}
          </span>
          {trace.result.responseSent && (
            <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-full">
              {t('probador.responses', { count: trace.result.responseTexts?.length || 0 })}
            </span>
          )}
        </div>
      )}

      {/* Vertical timeline */}
      <div className="relative">
        {/* Connector line */}
        <div className="absolute left-[14px] top-[30px] bottom-0 w-0.5 bg-gray-200" />

        {/* Steps */}
        <div className="space-y-3 relative">
          {steps.map((step, idx) => (
            <PipelineStep
              key={step.id}
              step={step}
              expanded={expandedSteps.has(step.id)}
              onToggle={toggleStep}
              animationDelay={idx * 100}
            >
              {/* Render children (AI Fallback sub-steps) */}
              {step.children && expandedSteps.has(step.id) && (
                <div className="mt-2 ml-4 pl-6 border-l-2 border-blue-200 space-y-2">
                  {step.children.map((child, childIdx) => (
                    <PipelineStep
                      key={child.id}
                      step={child}
                      expanded={expandedSteps.has(child.id)}
                      onToggle={toggleStep}
                      animationDelay={childIdx * 60}
                    />
                  ))}
                </div>
              )}
            </PipelineStep>
          ))}
        </div>
      </div>
    </div>
  )
}
