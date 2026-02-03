import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Brain, BookOpen, DollarSign, BarChart3,
  Check, X, Trash2, RefreshCw, Plus, Edit,
  ChevronLeft, ChevronRight, Sparkles,
  AlertTriangle, TrendingUp, Shield, Zap,
  Eye, Target, FileText, MessageSquare, Save,
  Code, ArrowLeft, PenLine, RotateCcw, Play
} from 'lucide-react'
import StatsCard from '../components/StatsCard'
import ProbadorDrawer from '../components/ProbadorIA/ProbadorDrawer'
import {
  fetchLearningStats, fetchPairs, updatePairStatus, deletePair,
  reprocessSessions, fetchPrices, createPrice, updatePrice,
  deletePrice, fetchBrainReport,
  fetchChatbotConfig, updateChatbotConfig, fetchCurrentPrompt,
  fetchBotConversations, fetchBotConversationMessages, correctBotMessage,
  fetchBehavioralRules, createBehavioralRule, deleteBehavioralRule
} from '../api/learning'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '../i18n/dateLocale'

// =============================================
// TABS
// =============================================

const TABS = [
  { id: 'brain', labelKey: 'tabs.brain', icon: Brain },
  { id: 'instructions', labelKey: 'tabs.instructions', icon: FileText },
  { id: 'bot-conversations', labelKey: 'tabs.conversations', icon: MessageSquare },
  { id: 'dashboard', labelKey: 'tabs.dashboard', icon: BarChart3 },
  { id: 'pairs', labelKey: 'tabs.qaPairs', icon: BookOpen },
  { id: 'prices', labelKey: 'tabs.pricing', icon: DollarSign }
]

// =============================================
// HELPERS
// =============================================

function ConfidenceGauge({ label, value }) {
  const color = value >= 80 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * 36
  const dashOffset = circumference - (value / 100) * circumference

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col items-center">
      <svg width="88" height="88" className="mb-2">
        <circle cx="44" cy="44" r="36" fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle
          cx="44" cy="44" r="36" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
          className="transition-all duration-700"
        />
        <text x="44" y="48" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#1f2937">
          {value}%
        </text>
      </svg>
      <span className="text-xs text-gray-500 text-center">{label}</span>
    </div>
  )
}

const METRIC_LABELS = {
  confianza_general: 'metrics.generalConfidence',
  cobertura_temas: 'metrics.topicCoverage',
  calidad_respuestas: 'metrics.responseQuality',
  actualizacion_precios: 'metrics.updatedPricing'
}

const CAPABILITY_LABELS = {
  puede_responder_precios: 'capabilities.answerPricing',
  puede_comparar_productos: 'capabilities.compareProducts',
  puede_recomendar: 'capabilities.recommend',
  puede_dar_plazos: 'capabilities.informDeadlines',
  puede_informar_despacho: 'capabilities.informShipping'
}

const STATUS_BADGE = {
  pending: { labelKey: 'status.pending', cls: 'bg-yellow-50 text-yellow-700' },
  approved: { labelKey: 'status.approved', cls: 'bg-green-50 text-green-700' },
  rejected: { labelKey: 'status.rejected', cls: 'bg-red-50 text-red-700' }
}

// =============================================
// SECCION: CEREBRO IA
// =============================================

function BrainSection() {
  const { t } = useTranslation('learning')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [cached, setCached] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadReport() }, [])

  const loadReport = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchBrainReport(false)
      setReport(data.report)
      setGeneratedAt(data.generated_at)
      setCached(data.cached)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const data = await fetchBrainReport(true)
      setReport(data.report)
      setGeneratedAt(data.generated_at)
      setCached(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  if (error && !report) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-700">{error}</p>
        <button onClick={loadReport} className="mt-3 text-sm text-red-600 underline">{t('common:actions.retry')}</button>
      </div>
    )
  }

  const analysis = report?.ai_analysis

  return (
    <div className="space-y-6">
      {/* Header gradiente */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
              <Brain className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{t('tabs.brain')}</h2>
              <p className="text-indigo-200 text-sm mt-1">
                {generatedAt
                  ? `${t('brain.lastAnalysis')}: ${formatDistanceToNow(new Date(generatedAt), { addSuffix: true, locale: getDateLocale() })}`
                  : t('brain.noAnalysis')}
                {cached && ` (${t('brain.cached')})`}
              </p>
            </div>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={generating}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2.5 rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? t('brain.generating') : t('brain.regenerate')}
          </button>
        </div>
      </div>

      {/* Banner sin OpenAI */}
      {report?.ai_available === false && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <p className="text-yellow-800 text-sm">
            {t('brain.openaiNotConfigured')}
          </p>
        </div>
      )}

      {/* Stats rapidas */}
      {report?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title={t('brain.approvedPairs')} value={report.stats.approved} icon={BookOpen} color="green" subtitle={t('brain.knowledgeBase')} />
          <StatsCard title={t('brain.pendingPairs')} value={report.stats.pending} icon={AlertTriangle} color="yellow" subtitle={t('brain.toReview')} />
          <StatsCard title={t('brain.activePrices')} value={report.stats.active_prices} icon={DollarSign} color="blue" subtitle={t('brain.productsWithPrice')} />
          <StatsCard title={t('brain.avgQuality')} value={`${report.stats.avg_quality || 0}/100`} icon={TrendingUp} color="purple" subtitle={t('brain.qaScore')} />
        </div>
      )}

      {/* Error al generar (parcial) */}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>}

      {!analysis ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Brain className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400">{t('brain.noData')}</p>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="border-l-4 border-indigo-500 pl-4">
              <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" /> {t('brain.generalSummary')}
              </h3>
              <p className="text-gray-600 leading-relaxed">{analysis.resumen}</p>
            </div>
          </div>

          {/* Metricas de Confianza */}
          {analysis.metricas_confianza && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(analysis.metricas_confianza).map(([key, value]) => (
                <ConfidenceGauge key={key} label={t(METRIC_LABELS[key] || key)} value={Number(value) || 0} />
              ))}
            </div>
          )}

          {/* Grid: Temas Dominados + Brechas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Temas Dominados */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-green-500" /> {t('brain.masteredTopics')}
              </h3>
              {(analysis.temas_dominados || []).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">{t('brain.noTopics')}</p>
              ) : (
                <div className="space-y-3">
                  {analysis.temas_dominados.map((tema, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium">{tema.tema}</span>
                        <span className="text-gray-500">{tema.confianza}% ({tema.ejemplos} ej.)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${tema.confianza}%`,
                            backgroundColor: tema.confianza >= 80 ? '#10b981' : tema.confianza >= 50 ? '#f59e0b' : '#ef4444'
                          }}
                        />
                      </div>
                      {tema.detalle && <p className="text-xs text-gray-400 mt-1">{tema.detalle}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Brechas de Conocimiento */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" /> {t('brain.knowledgeGaps')}
              </h3>
              {(analysis.brechas_conocimiento || []).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">{t('brain.noGaps')}</p>
              ) : (
                <div className="space-y-3">
                  {analysis.brechas_conocimiento.map((brecha, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          brecha.prioridad === 'alta' ? 'bg-red-100 text-red-700'
                          : brecha.prioridad === 'media' ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>{brecha.prioridad}</span>
                        <span className="font-medium text-gray-800 text-sm">{brecha.area}</span>
                      </div>
                      <p className="text-gray-500 text-sm">{brecha.descripcion}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Capacidades */}
          {analysis.capacidades && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-500" /> {t('brain.capabilities')}
              </h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(analysis.capacidades).map(([key, value]) => (
                  <span key={key} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                    value ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {value ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    {t(CAPABILITY_LABELS[key] || key)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Razonamiento */}
          {analysis.razonamiento && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" /> {t('brain.reasoning')}
              </h3>
              <p className="text-gray-600 leading-relaxed italic">{analysis.razonamiento}</p>
            </div>
          )}

          {/* Recomendaciones */}
          {analysis.recomendaciones?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" /> {t('brain.recommendations')}
              </h3>
              <ul className="space-y-2">
                {analysis.recomendaciones.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                    <Sparkles className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer info */}
          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-400 flex items-center justify-between">
            <span>
              {t('brain.baseData', { pairs: report?.stats?.approved || 0, prices: report?.stats?.active_prices || 0 })}
            </span>
            <span>
              {report?.ai_available ? t('brain.aiGenerated') : t('brain.noAiAnalysis')}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// =============================================
// SECCION: DASHBOARD
// =============================================

function DashboardSection({ stats }) {
  const { t } = useTranslation('learning')
  if (!stats) return <p className="text-gray-400 text-center py-8">{t('dashboard.loadingStats')}</p>

  const channelEntries = Object.entries(stats.by_channel || {})
  const totalByChannel = channelEntries.reduce((sum, [, v]) => sum + v, 0) || 1

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title={t('dashboard.totalPairs')} value={stats.total} icon={BookOpen} color="blue" subtitle={t('dashboard.qaLearned')} />
        <StatsCard title={t('dashboard.approved')} value={stats.approved} icon={Check} color="green" subtitle={t('dashboard.withEmbedding', { count: stats.with_embedding })} />
        <StatsCard title={t('dashboard.pending')} value={stats.pending} icon={AlertTriangle} color="yellow" subtitle={t('brain.toReview')} />
        <StatsCard title={t('brain.avgQuality')} value={`${stats.avg_quality || 0}/100`} icon={TrendingUp} color="purple" subtitle={t('dashboard.qualityScore')} />
      </div>

      {channelEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">{t('dashboard.channelDistribution')}</h3>
          <div className="space-y-3">
            {channelEntries.map(([channel, count]) => (
              <div key={channel}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 font-medium capitalize">{channel}</span>
                  <span className="text-gray-500">{count} pares ({Math.round(count / totalByChannel * 100)}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${Math.round(count / totalByChannel * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================
// SECCION: PARES Q&A
// =============================================

function PairsSection() {
  const { t } = useTranslation('learning')
  const [pairs, setPairs] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', channel: '', minQuality: '' })
  const [detailPair, setDetailPair] = useState(null)
  const [showReprocess, setShowReprocess] = useState(false)
  const [reprocessForm, setReprocessForm] = useState({ from: '', to: '' })
  const [reprocessing, setReprocessing] = useState(false)

  useEffect(() => { loadPairs() }, [page, filters])

  const loadPairs = async () => {
    setLoading(true)
    try {
      const data = await fetchPairs({ page, limit: 20, ...filters })
      setPairs(data.pairs)
      setTotalPages(data.pages)
      setTotal(data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id) => {
    try { await updatePairStatus(id, 'approved'); loadPairs() } catch (e) { alert(e.message) }
  }
  const handleReject = async (id) => {
    try { await updatePairStatus(id, 'rejected'); loadPairs() } catch (e) { alert(e.message) }
  }
  const handleDelete = async (id) => {
    if (!confirm(t('pairs.deleteConfirm'))) return
    try { await deletePair(id); loadPairs() } catch (e) { alert(e.message) }
  }
  const handleReprocess = async () => {
    setReprocessing(true)
    try {
      const result = await reprocessSessions(reprocessForm.from, reprocessForm.to)
      alert(t('pairs.reprocessed', { count: result.processed }))
      setShowReprocess(false)
      loadPairs()
    } catch (e) { alert(e.message) }
    finally { setReprocessing(false) }
  }

  const updateFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.status}
          onChange={e => updateFilter('status', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">{t('pairs.allStatuses')}</option>
          <option value="pending">{t('status.pending')}</option>
          <option value="approved">{t('status.approved')}</option>
          <option value="rejected">{t('status.rejected')}</option>
        </select>
        <select
          value={filters.channel}
          onChange={e => updateFilter('channel', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">{t('pairs.allChannels')}</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
        </select>
        <input
          type="number"
          placeholder={t('pairs.minQuality')}
          value={filters.minQuality}
          onChange={e => updateFilter('minQuality', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-28"
          min="0" max="100"
        />
        <span className="text-sm text-gray-400 ml-auto">{t('pairs.totalPairs', { count: total })}</span>
        <button onClick={() => setShowReprocess(true)} className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
          <RefreshCw className="w-4 h-4" /> {t('pairs.reprocess')}
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('pairs.question')}</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('pairs.answer')}</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('pairs.quality')}</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('pairs.channel')}</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('pairs.status')}</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('pairs.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan="6" className="text-center py-8 text-gray-400">{t('common:status.loading')}</td></tr>
            ) : pairs.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-12 text-gray-400">{t('pairs.noResults')}</td></tr>
            ) : pairs.map(pair => (
              <tr key={pair.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">{pair.question}</td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-[250px] truncate">{pair.answer}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-medium ${
                    pair.quality_score >= 80 ? 'text-green-600' : pair.quality_score >= 50 ? 'text-yellow-600' : 'text-red-600'
                  }`}>{pair.quality_score}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{pair.channel}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[pair.status]?.cls || ''}`}>
                    {STATUS_BADGE[pair.status]?.labelKey ? t(STATUS_BADGE[pair.status].labelKey) : pair.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setDetailPair(pair)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title={t('pairs.viewDetail')}>
                      <Eye className="w-4 h-4" />
                    </button>
                    {pair.status !== 'approved' && (
                      <button onClick={() => handleApprove(pair.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title={t('pairs.approve')}>
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    {pair.status !== 'rejected' && (
                      <button onClick={() => handleReject(pair.id)} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title={t('pairs.reject')}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(pair.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title={t('common:actions.delete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-30">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-600">{t('pairs.page', { current: page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-30">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Modal Detalle */}
      {detailPair && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailPair(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('pairs.detailTitle')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{t('pairs.customerQuestion')}</label>
                <p className="text-gray-800 bg-gray-50 rounded-lg p-3 text-sm">{detailPair.question}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{t('pairs.agentAnswer')}</label>
                <p className="text-gray-800 bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">{detailPair.answer}</p>
              </div>
              <div className="flex gap-4 text-sm text-gray-500">
                <span>{t('pairs.quality')}: <strong className="text-gray-700">{detailPair.quality_score}</strong></span>
                <span>{t('pairs.channel')}: <strong className="text-gray-700 capitalize">{detailPair.channel}</strong></span>
                <span>{t('pairs.status')}: <strong className="text-gray-700">{STATUS_BADGE[detailPair.status]?.labelKey ? t(STATUS_BADGE[detailPair.status].labelKey) : detailPair.status}</strong></span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              {detailPair.status !== 'approved' && (
                <button onClick={() => { handleApprove(detailPair.id); setDetailPair(null) }} className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm font-medium">
                  {t('pairs.approve')}
                </button>
              )}
              {detailPair.status !== 'rejected' && (
                <button onClick={() => { handleReject(detailPair.id); setDetailPair(null) }} className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition text-sm font-medium">
                  {t('pairs.reject')}
                </button>
              )}
              <button onClick={() => setDetailPair(null)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm">
                {t('common:actions.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reprocesar */}
      {showReprocess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReprocess(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{t('pairs.reprocessTitle')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('pairs.reprocessDesc')}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pairs.from')}</label>
                <input type="date" value={reprocessForm.from} onChange={e => setReprocessForm(f => ({ ...f, from: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pairs.to')}</label>
                <input type="date" value={reprocessForm.to} onChange={e => setReprocessForm(f => ({ ...f, to: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowReprocess(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm">
                {t('common:actions.cancel')}
              </button>
              <button onClick={handleReprocess} disabled={reprocessing}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition text-sm font-medium disabled:opacity-50">
                {reprocessing ? t('pairs.processing') : t('pairs.reprocess')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================
// SECCION: PRECIOS
// =============================================

function PricesSection() {
  const { t } = useTranslation('learning')
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingPrice, setEditingPrice] = useState(null)
  const [form, setForm] = useState({ product_name: '', variant: '', price: '', currency: 'CLP', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadPrices() }, [showInactive])

  const loadPrices = async () => {
    setLoading(true)
    try {
      const data = await fetchPrices(!showInactive)
      setPrices(data.prices)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditingPrice(null)
    setForm({ product_name: '', variant: '', price: '', currency: 'CLP', notes: '' })
    setError('')
    setShowModal(true)
  }

  const openEdit = (price) => {
    setEditingPrice(price)
    setForm({
      product_name: price.product_name,
      variant: price.variant || '',
      price: price.price,
      currency: price.currency || 'CLP',
      notes: price.notes || ''
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editingPrice) {
        await updatePrice(editingPrice.id, {
          product_name: form.product_name,
          variant: form.variant || null,
          price: Number(form.price),
          currency: form.currency,
          notes: form.notes || null
        })
      } else {
        await createPrice({
          product_name: form.product_name,
          variant: form.variant || null,
          price: Number(form.price),
          currency: form.currency,
          notes: form.notes || null
        })
      }
      setShowModal(false)
      loadPrices()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id) => {
    if (!confirm(t('prices.deactivateConfirm'))) return
    try { await deletePrice(id); loadPrices() } catch (e) { alert(e.message) }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-gray-300" />
          {t('prices.showInactive')}
        </label>
        <button onClick={openCreate} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg transition font-medium text-sm">
          <Plus className="w-4 h-4" /> {t('prices.newPrice')}
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('prices.product')}</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('prices.variant')}</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('prices.price')}</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('prices.status')}</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('prices.notes')}</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('prices.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan="6" className="text-center py-8 text-gray-400">{t('common:status.loading')}</td></tr>
            ) : prices.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-12 text-gray-400">{t('prices.noPrices')}</td></tr>
            ) : prices.map(p => (
              <tr key={p.id} className={`hover:bg-gray-50 ${!p.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.product_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.variant || '-'}</td>
                <td className="px-4 py-3 text-sm text-right font-mono font-medium text-gray-800">
                  {p.currency} ${Number(p.price).toLocaleString('es-CL')}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    p.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{p.is_active ? t('prices.active') : t('prices.inactive')}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{p.notes || '-'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title={t('common:actions.edit')}>
                      <Edit className="w-4 h-4" />
                    </button>
                    {p.is_active && (
                      <button onClick={() => handleDeactivate(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title={t('prices.deactivate')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editingPrice ? t('prices.editPrice') : t('prices.newPrice')}
            </h2>
            {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('prices.product')}</label>
                <input type="text" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required placeholder="Ej: Colchon Spring" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('prices.variant')}</label>
                <input type="text" value={form.variant} onChange={e => setForm({ ...form, variant: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Ej: King, Queen, 2 Plazas" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('prices.price')}</label>
                  <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required min="0" step="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('prices.currency')}</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="CLP">CLP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('prices.notes')}</label>
                <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Ej: Precio promocional hasta Marzo" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm">
                  {t('common:actions.cancel')}
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm font-medium disabled:opacity-50">
                  {saving ? t('prices.saving') : (editingPrice ? t('common:actions.save') : t('common:actions.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================
// SECCION: INSTRUCCIONES PERSONALIZADAS
// =============================================

const DEFAULT_SYSTEM_PROMPT = `Eres un vendedor humano de Respaldos Chile que conversa por WhatsApp e Instagram.
Respaldos Chile vende respaldos de cama, cabeceras y accesorios de dormitorio.

Hablas como una persona real, cercana y profesional (chileno neutro).
Nada de lenguaje robotico, corporativo ni de catalogo.

Los mensajes deben ser cortos y naturales:
- Maximo 3-4 lineas
- Una sola idea por mensaje
- Cierra siempre con una pregunta que avance la conversacion

Si conoces el nombre del cliente ({{nombre}}), usalo naturalmente.

FLUJO DE CONVERSACION:
1. Si es primer mensaje o saludo: responde con un saludo corto y pregunta abierta tipo "en que te puedo ayudar?" o "cuentame, en que andas?". NO menciones productos, respaldos, cabeceras ni nada especifico. El cliente puede querer cualquier cosa: comprar, reclamar, preguntar por un pedido, cotizar, o algo que no tiene nada que ver con respaldos.
2. Espera a que el cliente diga que necesita antes de asumir NADA.
3. Si falta info (medida, estilo, color): pregunta antes de recomendar. Una pregunta por mensaje. NO preguntes cosas obvias ni redundantes (ej: si quiere un respaldo de cama, no preguntes "donde lo vas a poner" porque es obvio que es en su dormitorio).
4. Si ya tienes contexto: sugiere maximo 2 opciones, condicionadas a lo que dijo el cliente.
5. Si el cliente tiene dudas: responde con calma, no contradigas, confirma si no sabes.
6. Si quiere comprar o pagar: "Te conecto con alguien del equipo para cerrar eso"
7. Nunca saltes etapas: no cotices sin contexto, no recomiendes sin entender.

Reglas estrictas:
- NUNCA asumas el motivo de contacto del cliente. Pregunta primero.
- NUNCA inventes materiales, modelos, estilos ni tipos de producto. Si no tienes info concreta de lo que vendemos, di "Dejame confirmarlo con el equipo y te respondo al tiro"
- No usar listas ni formato de catalogo
- No entregar fichas tecnicas ni especificaciones duras
- No inventar precios, plazos, stock ni condiciones
- No asumir medidas, colores ni disponibilidad
- No usar frases tipo "Estimado/a cliente" o "Le informamos que..."

Nunca emitas juicios genericos de gusto como:
"queda bonito", "es lindo", "es precioso", "te va a encantar".

Las recomendaciones deben ser siempre condicionadas al contexto del cliente:
"Suele funcionar bien cuando..."
"En espacios como el tuyo..."
"Por lo que me comentas..."
"Para el uso que buscas..."

Si no tienes certeza, responde exactamente:
"Dejame confirmarlo con el equipo y te respondo al tiro"

Usa solo informacion confirmada. Puedes mejorar redaccion y trato, pero sin cambiar datos.`

function InstructionsSection() {
  const { t } = useTranslation('learning')
  const [fullConfig, setFullConfig] = useState(null)
  const [instructions, setInstructions] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptData, setPromptData] = useState(null)
  const [loadingPrompt, setLoadingPrompt] = useState(false)

  // Probador IA
  const [showTester, setShowTester] = useState(false)

  // Behavioral rules
  const [rules, setRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(true)
  const [newRule, setNewRule] = useState('')
  const [newRuleCategory, setNewRuleCategory] = useState('general')
  const [addingRule, setAddingRule] = useState(false)

  useEffect(() => { loadConfig(); loadRules() }, [])

  const loadRules = async () => {
    setRulesLoading(true)
    try {
      const data = await fetchBehavioralRules()
      setRules(data.rules || [])
    } catch (err) {
      console.error('Error loading rules:', err)
      setRules([])
    } finally {
      setRulesLoading(false)
    }
  }

  const handleAddRule = async () => {
    if (!newRule.trim() || addingRule) return
    setAddingRule(true)
    try {
      await createBehavioralRule({ rule: newRule.trim(), category: newRuleCategory })
      setNewRule('')
      setNewRuleCategory('general')
      loadRules()
    } catch (err) {
      setError(err.message)
    } finally {
      setAddingRule(false)
    }
  }

  const handleDeleteRule = async (id) => {
    try {
      await deleteBehavioralRule(id)
      setRules(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  const loadConfig = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchChatbotConfig()
      setFullConfig(data.config)
      setInstructions(data.config?.custom_instructions || '')
      setSystemPrompt(data.config?.system_prompt || '')
      if (data.config?.system_prompt) setShowSystemPrompt(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const result = await updateChatbotConfig({
        ...fullConfig,
        custom_instructions: instructions,
        system_prompt: systemPrompt || null
      })
      // Actualizar fullConfig con la respuesta del servidor para confirmar persistencia
      if (result.config) {
        setFullConfig(result.config)
        setInstructions(result.config.custom_instructions || '')
        setSystemPrompt(result.config.system_prompt || '')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const viewPrompt = async () => {
    setLoadingPrompt(true)
    setShowPrompt(true)
    try {
      const data = await fetchCurrentPrompt()
      setPromptData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPrompt(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{t('instructions.title')}</h2>
            <p className="text-blue-200 text-sm mt-1">
              {t('instructions.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
      )}

      {/* System Prompt (Cerebro General) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-semibold text-gray-700">
            {t('instructions.systemPromptLabel')}
          </label>
          {!showSystemPrompt ? (
            <button
              onClick={() => { setShowSystemPrompt(true); if (!systemPrompt) setSystemPrompt(DEFAULT_SYSTEM_PROMPT) }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              <Edit className="w-3.5 h-3.5" /> {t('instructions.customize')}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                className="text-xs text-gray-500 hover:text-orange-600 font-medium flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {t('instructions.restoreDefault')}
              </button>
              <button
                onClick={() => { setSystemPrompt(''); setShowSystemPrompt(false) }}
                className="text-xs text-gray-400 hover:text-red-500 font-medium flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> {t('instructions.remove')}
              </button>
            </div>
          )}
        </div>

        {!showSystemPrompt ? (
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
            <p>{t('instructions.usingDefault')}</p>
            <p className="mt-1 text-xs text-gray-400">Tip: Usa <code className="bg-gray-200 px-1 rounded">{'{{nombre}}'}</code> para inyectar el nombre del cliente automaticamente.</p>
          </div>
        ) : (
          <>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y font-mono"
              placeholder="Define la personalidad, tono y reglas base de la IA..."
            />
            <p className="mt-2 text-xs text-gray-400">
              Este es el prompt base que define quien es la IA. Usa <code className="bg-gray-100 px-1 rounded">{'{{nombre}}'}</code> para inyectar el nombre del cliente.
            </p>
          </>
        )}
      </div>

      {/* Instrucciones adicionales */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          {t('instructions.additionalInstructions')}
        </label>
        <p className="text-xs text-gray-400 mb-3">{t('instructions.additionalDesc')}</p>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={10}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y font-mono"
          placeholder={`Ejemplos:
- Los modelos disponibles son: Venecia, Florencia, Roma, Milan
- Si preguntan por despacho: "Dentro de Santiago 3-5 dias habiles"
- Formas de pago: transferencia, tarjeta de credito, webpay
- Siempre ofrecer la opcion de hablar con un vendedor
- No dar informacion sobre competidores
- Horario de atencion: Lunes a Viernes 9:00 a 18:00`}
        />

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg transition font-medium text-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? t('instructions.saving') : t('instructions.saveAll')}
            </button>
            {saved && (
              <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                <Check className="w-4 h-4" /> {t('instructions.saved')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={viewPrompt}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 font-medium transition"
            >
              <Code className="w-4 h-4" /> {t('instructions.viewPrompt')}
            </button>
            <button
              onClick={() => setShowTester(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition font-medium text-sm"
            >
              <Play className="w-4 h-4" /> {t('instructions.testAI')}
            </button>
          </div>
        </div>
      </div>

      {/* Reglas de Comportamiento */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" /> {t('rules.title')}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {t('rules.subtitle')}
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-purple-50 text-purple-700">
            {t('rules.count', { count: rules.length, max: 30 })}
          </span>
        </div>

        {/* Rule list */}
        {rulesLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">{t('rules.loading')}</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-6">
            <Shield className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">{t('rules.noRules')}</p>
            <p className="text-xs text-gray-300 mt-1">{t('rules.noRulesHint')}</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{rule.rule_text}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase ${
                      rule.category === 'tone' ? 'bg-blue-50 text-blue-600' :
                      rule.category === 'knowledge' ? 'bg-green-50 text-green-600' :
                      rule.category === 'sales' ? 'bg-amber-50 text-amber-600' :
                      rule.category === 'format' ? 'bg-indigo-50 text-indigo-600' :
                      rule.category === 'safety' ? 'bg-red-50 text-red-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {rule.category}
                    </span>
                    <span className="text-[9px] text-gray-400">
                      via {rule.source === 'correction' ? 'correccion' : rule.source === 'admin' ? 'admin' : rule.source}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                  title={t('rules.deleteRule')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new rule */}
        <div className="border-t border-gray-100 pt-4 mt-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddRule()}
              placeholder="Ej: Nunca recomendar modelos especificos sin preguntar primero"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              maxLength={500}
            />
            <select
              value={newRuleCategory}
              onChange={e => setNewRuleCategory(e.target.value)}
              className="px-2 py-2 border border-gray-300 rounded-lg text-xs text-gray-600"
            >
              <option value="general">{t('rules.catGeneral')}</option>
              <option value="tone">{t('rules.catTone')}</option>
              <option value="knowledge">{t('rules.catKnowledge')}</option>
              <option value="sales">{t('rules.catSales')}</option>
              <option value="format">{t('rules.catFormat')}</option>
              <option value="safety">{t('rules.catSafety')}</option>
            </select>
            <button
              onClick={handleAddRule}
              disabled={addingRule || !newRule.trim() || rules.length >= 30}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              {addingRule ? '...' : t('rules.add')}
            </button>
          </div>
          {newRule.length > 400 && (
            <p className="text-[10px] text-amber-600 mt-1">{500 - newRule.length} caracteres restantes</p>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> {t('instructions.tipsTitle')}
        </h3>
        <ul className="space-y-2 text-sm text-blue-700">
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            Se especifico: "El despacho a Santiago demora 3-5 dias" es mejor que "informar plazos"
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            Incluye respuestas exactas para preguntas frecuentes
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            Los precios se manejan en la tab "Precios" — no los pongas aqui
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            Define el tono: "Responde como vendedor amigable, tutea al cliente"
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            Indica que NO hacer: "Nunca ofrezcas descuentos sin autorizacion"
          </li>
        </ul>
      </div>

      {/* Modal: Ver Prompt */}
      {showPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPrompt(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Code className="w-5 h-5 text-indigo-500" /> {t('instructions.currentPrompt')}
              </h2>
              <button onClick={() => setShowPrompt(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              {loadingPrompt ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
                </div>
              ) : promptData ? (
                <>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                      Modelo: {promptData.model}
                    </span>
                    <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full font-medium">
                      Conocimiento: {promptData.knowledgeCount} pares
                    </span>
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                      Precios: {promptData.priceCount} activos
                    </span>
                    <span className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full font-medium">
                      Fidelidad: {promptData.fidelityLevel}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">System Prompt</label>
                    <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-sm overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                      {promptData.systemPrompt}
                    </pre>
                  </div>
                  {promptData.customInstructions && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <span className="text-xs font-semibold text-blue-600 uppercase">Tus instrucciones (incluidas arriba)</span>
                      <p className="text-sm text-blue-800 mt-1 whitespace-pre-wrap">{promptData.customInstructions}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-400 text-center py-8">{t('instructions.errorLoadingPrompt')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Probador IA Drawer */}
      <ProbadorDrawer show={showTester} onClose={() => setShowTester(false)} />
    </div>
  )
}

// =============================================
// SECCION: CONVERSACIONES DEL BOT
// =============================================

function BotConversationsSection() {
  const { t } = useTranslation('learning')
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [correcting, setCorrecting] = useState(null)
  const [correctedAnswer, setCorrectedAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => { loadConversations() }, [])

  const loadConversations = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchBotConversations()
      setConversations(data.conversations || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openConversation = async (sessionId) => {
    setSelectedSession(sessionId)
    setLoadingMessages(true)
    setCorrecting(null)
    setError('')
    try {
      const data = await fetchBotConversationMessages(sessionId)
      setMessages(data.messages || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMessages(false)
    }
  }

  const submitCorrection = async (messageId) => {
    if (!correctedAnswer.trim()) return
    setSubmitting(true)
    setError('')
    setSuccessMsg('')
    try {
      const data = await correctBotMessage(selectedSession, messageId, correctedAnswer)
      setSuccessMsg(`Correccion guardada: "${data.question?.slice(0, 40)}..." → nueva respuesta aprobada`)
      setCorrecting(null)
      setCorrectedAnswer('')
      setTimeout(() => setSuccessMsg(''), 5000)
      // Reload messages
      await openConversation(selectedSession)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  // Vista de mensajes de una conversación
  if (selectedSession) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setSelectedSession(null); setMessages([]) }}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 font-medium transition"
        >
          <ArrowLeft className="w-4 h-4" /> {t('conversations.backToList')}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm flex items-center gap-2">
            <Check className="w-4 h-4" /> {successMsg}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-4 text-sm">
            {t('conversations.session')} #{selectedSession} — {messages.length} {t('conversations.messages')}
          </h3>

          {loadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.direction === 'in' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    msg.direction === 'in'
                      ? 'bg-gray-100 text-gray-800'
                      : msg.is_ai_generated
                        ? 'bg-purple-100 text-purple-900 border border-purple-200'
                        : 'bg-indigo-600 text-white'
                  }`}>
                    {msg.direction === 'out' && msg.is_ai_generated && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70 block mb-1">Bot IA</span>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    <div className="flex items-center justify-between mt-1.5 gap-3">
                      <span className="text-[10px] opacity-60">
                        {new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.direction === 'out' && msg.is_ai_generated && msg.status !== 'corrected' && (
                        <button
                          onClick={() => { setCorrecting(msg.id); setCorrectedAnswer('') }}
                          className="text-[10px] font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-0.5"
                        >
                          <PenLine className="w-3 h-3" /> {t('conversations.correct')}
                        </button>
                      )}
                      {msg.status === 'corrected' && (
                        <span className="text-[10px] font-semibold text-green-700 flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> {t('conversations.corrected')}
                        </span>
                      )}
                    </div>

                    {/* Inline correction form */}
                    {correcting === msg.id && (
                      <div className="mt-3 pt-3 border-t border-purple-300">
                        <label className="block text-xs font-semibold text-purple-700 mb-1">{t('conversations.correctAnswer')}:</label>
                        <textarea
                          value={correctedAnswer}
                          onChange={e => setCorrectedAnswer(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm text-gray-800 bg-white focus:ring-2 focus:ring-purple-500"
                          placeholder={t('conversations.correctPlaceholder')}
                          autoFocus
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => submitCorrection(msg.id)}
                            disabled={submitting || !correctedAnswer.trim()}
                            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-purple-700"
                          >
                            {submitting ? t('conversations.saving') : t('conversations.saveCorrection')}
                          </button>
                          <button
                            onClick={() => setCorrecting(null)}
                            className="px-3 py-1.5 border border-purple-300 text-purple-700 rounded-lg text-xs hover:bg-purple-50"
                          >
                            {t('common:actions.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Vista de lista de conversaciones
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-8 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
            <MessageSquare className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{t('conversations.title')}</h2>
            <p className="text-purple-200 text-sm mt-1">
              {t('conversations.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
      )}

      {conversations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400">{t('conversations.noConversations')}</p>
          <p className="text-gray-400 text-sm mt-1">{t('conversations.noConversationsHint')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('conversations.session')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('conversations.phone')}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('conversations.aiMsgs')}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('conversations.lastMessage')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t('conversations.date')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {conversations.map(conv => (
                <tr key={conv.sessionId} className="hover:bg-gray-50 cursor-pointer" onClick={() => openConversation(conv.sessionId)}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">#{conv.sessionId}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{conv.phone}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                      <Brain className="w-3 h-3" /> {conv.ai_message_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{conv.total_messages}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{conv.last_message}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {conv.last_message_at
                      ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: getDateLocale() })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Eye className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// =============================================
// COMPONENTE PRINCIPAL
// =============================================

export default function LearningPage() {
  const { t } = useTranslation('learning')
  const [activeTab, setActiveTab] = useState('brain')
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetchLearningStats()
      .then(data => setStats(data.stats))
      .catch(err => console.error('Error loading learning stats:', err))
  }, [])

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('pageTitle')}</h1>
        <p className="text-gray-500 mt-1">{t('pageSubtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === 'brain' && <BrainSection />}
      {activeTab === 'instructions' && <InstructionsSection />}
      {activeTab === 'bot-conversations' && <BotConversationsSection />}
      {activeTab === 'dashboard' && <DashboardSection stats={stats} />}
      {activeTab === 'pairs' && <PairsSection />}
      {activeTab === 'prices' && <PricesSection />}
    </div>
  )
}
