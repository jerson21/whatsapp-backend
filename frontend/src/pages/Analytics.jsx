import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  fetchAnalyticsSummary,
  fetchTimeline,
  fetchByFlow,
  fetchByHour,
  fetchTriggerTypes
} from '../api/analytics'
import { format } from 'date-fns'
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  ArrowRightLeft,
  RefreshCw,
  GitBranch
} from 'lucide-react'

export default function Analytics() {
  const { t } = useTranslation('analytics')
  const [summary, setSummary] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [byFlow, setByFlow] = useState([])
  const [byHour, setByHour] = useState([])
  const [triggerTypes, setTriggerTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)

  useEffect(() => {
    loadData()
  }, [days])

  const loadData = async () => {
    setLoading(true)
    try {
      const [summaryData, timelineData, flowData, hourData, triggerData] = await Promise.all([
        fetchAnalyticsSummary(days),
        fetchTimeline(days),
        fetchByFlow(days),
        fetchByHour(days),
        fetchTriggerTypes(days)
      ])

      setSummary(summaryData.summary)
      setTimeline(timelineData.timeline || [])
      setByFlow(flowData.flows || [])
      setByHour(hourData.hourly || [])
      setTriggerTypes(triggerData.trigger_types || [])
    } catch (err) {
      console.error('Error loading analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  const maxTimelineValue = Math.max(...timeline.map(t => t.total), 1)
  const maxHourValue = Math.max(...byHour.map(h => h.executions), 1)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('title')}</h1>
          <p className="text-gray-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          >
            <option value={7}>{t('lastDays', { count: 7 })}</option>
            <option value={14}>{t('lastDays', { count: 14 })}</option>
            <option value={30}>{t('lastDays', { count: 30 })}</option>
          </select>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
            {t('refresh')}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('totalExecutions')}</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{summary.executions.total}</p>
                <p className="text-xs text-gray-400 mt-1">{t('uniqueUsers', { count: summary.executions.unique_users })}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('completionRate')}</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{summary.executions.completion_rate}%</p>
                <p className="text-xs text-gray-400 mt-1">{t('completedCount', { count: summary.executions.completed })}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('failed')}</p>
                <p className="text-3xl font-bold text-red-500 mt-1">{summary.executions.failed}</p>
                <p className="text-xs text-gray-400 mt-1">{t('transferredCount', { count: summary.executions.transferred })}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-xl">
                <XCircle className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('avgTime')}</p>
                <p className="text-3xl font-bold text-purple-600 mt-1">{summary.executions.avg_duration_ms}ms</p>
                <p className="text-xs text-gray-400 mt-1">{t('avgNodes', { count: summary.executions.avg_nodes })}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-xl">
                <Clock className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-400" />
          {t('executionsPerDay')}
        </h3>

        {timeline.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            {t('noDataToShow')}
          </div>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {timeline.map((day, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center">
                <div className="w-full flex flex-col gap-0.5" style={{ height: '120px' }}>
                  <div
                    className="w-full bg-green-500 rounded-t"
                    style={{ height: `${(day.completed / maxTimelineValue) * 100}%` }}
                    title={t('tooltipCompleted', { count: day.completed })}
                  />
                  <div
                    className="w-full bg-red-400"
                    style={{ height: `${(day.failed / maxTimelineValue) * 100}%` }}
                    title={t('tooltipFailed', { count: day.failed })}
                  />
                  <div
                    className="w-full bg-yellow-400 rounded-b"
                    style={{ height: `${(day.transferred / maxTimelineValue) * 100}%` }}
                    title={t('tooltipTransferred', { count: day.transferred })}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {format(new Date(day.date), 'dd/MM')}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span className="text-xs text-gray-500">{t('completed')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-red-400" />
            <span className="text-xs text-gray-500">{t('failed')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-yellow-400" />
            <span className="text-xs text-gray-500">{t('transferred')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* By Flow */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-gray-400" />
            {t('performanceByFlow')}
          </h3>

          {byFlow.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              {t('noFlowsConfigured')}
            </div>
          ) : (
            <div className="space-y-3">
              {byFlow.slice(0, 5).map((flow, idx) => (
                <div key={flow.flow_id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-800 truncate">{flow.flow_name}</p>
                      <span className="text-sm text-gray-500">{flow.recent_executions} {t('executions')}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${flow.completion_rate}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{flow.completion_rate}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Link
            to="/flows"
            className="block text-center text-sm text-green-600 hover:text-green-700 mt-4 pt-4 border-t border-gray-100"
          >
            {t('viewAllFlows')}
          </Link>
        </div>

        {/* By Hour */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            {t('activityByHour')}
          </h3>

          <div className="flex items-end gap-1 h-32">
            {byHour.map((hour, idx) => (
              <div
                key={idx}
                className="flex-1 bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                style={{
                  height: `${(hour.executions / maxHourValue) * 100}%`,
                  minHeight: hour.executions > 0 ? '4px' : '0'
                }}
                title={t('tooltipHourExecutions', { hour: hour.hour, count: hour.executions })}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>
      </div>

      {/* Trigger Types */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-gray-400" />
          {t('triggerDistribution')}
        </h3>

        {triggerTypes.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            {t('noTriggerData')}
          </div>
        ) : (
          <div className="flex gap-6">
            {triggerTypes.map((trigger, idx) => {
              const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899']
              const color = colors[idx % colors.length]
              const total = triggerTypes.reduce((sum, t) => sum + t.count, 0)
              const percentage = total > 0 ? Math.round((trigger.count / total) * 100) : 0

              return (
                <div key={trigger.trigger_type} className="text-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ background: `${color}20` }}
                  >
                    <span className="text-xl font-bold" style={{ color }}>{percentage}%</span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 capitalize">{trigger.trigger_type}</p>
                  <p className="text-xs text-gray-400">{trigger.count} {t('executions')}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
