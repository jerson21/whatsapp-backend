import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchLeads, fetchLeadStats, updateLead, adjustLeadScore } from '../api/leads'
import { formatDistanceToNow, format } from 'date-fns'
import { getDateLocale } from '../i18n/dateLocale'
import {
  Users,
  Search,
  Filter,
  TrendingUp,
  Phone,
  MessageSquare,
  Star,
  ChevronRight,
  X,
  Plus,
  Minus,
  RefreshCw
} from 'lucide-react'

const STATUS_CONFIG = {
  new: { labelKey: 'statusNew', color: '#6b7280', bg: '#f3f4f6' },
  engaged: { labelKey: 'statusEngaged', color: '#3b82f6', bg: '#dbeafe' },
  qualified: { labelKey: 'statusQualified', color: '#10b981', bg: '#d1fae5' },
  customer: { labelKey: 'statusClient', color: '#8b5cf6', bg: '#ede9fe' },
  inactive: { labelKey: 'statusInactive', color: '#9ca3af', bg: '#f9fafb' }
}

const SCORE_COLORS = {
  hot: { color: '#ef4444', labelKey: 'hot', range: '80-100' },
  warm: { color: '#f59e0b', labelKey: 'warm', range: '50-79' },
  cold: { color: '#3b82f6', labelKey: 'cold', range: '20-49' },
  new: { color: '#6b7280', labelKey: 'new', range: '0-19' }
}

function getScoreCategory(score) {
  if (score >= 80) return 'hot'
  if (score >= 50) return 'warm'
  if (score >= 20) return 'cold'
  return 'new'
}

export default function Leads() {
  const navigate = useNavigate()
  const { t } = useTranslation('leads')
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState(null)
  const [filters, setFilters] = useState({
    status: '',
    min_score: '',
    search: '',
    sort_by: 'current_score',
    sort_dir: 'desc'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [leadsData, statsData] = await Promise.all([
        fetchLeads({ limit: 100, ...filters }),
        fetchLeadStats()
      ])
      setLeads(leadsData.leads || [])
      setStats(statsData)
    } catch (err) {
      console.error('Error loading leads:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const applyFilters = () => {
    loadData()
  }

  const handleStatusChange = async (phone, newStatus) => {
    try {
      await updateLead(phone, { status: newStatus })
      loadData()
    } catch (err) {
      console.error('Error updating lead:', err)
    }
  }

  const handleScoreAdjust = async (phone, adjustment) => {
    try {
      await adjustLeadScore(phone, adjustment, 'Manual adjustment')
      loadData()
    } catch (err) {
      console.error('Error adjusting score:', err)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('title')}</h1>
          <p className="text-gray-500 mt-1">{t('subtitle')}</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          {t('common:actions.refresh')}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{t('totalLeads')}</p>
            <p className="text-2xl font-bold text-gray-800">{stats.stats?.total_leads || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{t('avgScore')}</p>
            <p className="text-2xl font-bold text-blue-600">{stats.stats?.avg_score || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{t('newLeads')}</p>
            <p className="text-2xl font-bold text-gray-600">{stats.stats?.new_leads || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{t('qualified')}</p>
            <p className="text-2xl font-bold text-green-600">{stats.stats?.qualified_leads || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{t('clients')}</p>
            <p className="text-2xl font-bold text-purple-600">{stats.stats?.customers || 0}</p>
          </div>
        </div>
      )}

      {/* Score Distribution */}
      {stats?.score_distribution && (
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">{t('scoreDistribution')}</p>
          <div className="flex gap-4">
            {Object.entries(SCORE_COLORS).map(([key, config]) => {
              const count = stats.score_distribution.find(d => d.category === key)?.count || 0
              return (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: config.color }}
                  />
                  <span className="text-sm text-gray-600">
                    {t(config.labelKey)}: <strong>{count}</strong>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">{t('filter')}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none w-48"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          >
            <option value="">{t('allStatuses')}</option>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{t(config.labelKey)}</option>
            ))}
          </select>
          <select
            value={filters.min_score}
            onChange={(e) => handleFilterChange('min_score', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          >
            <option value="">{t('allScores')}</option>
            <option value="80">{t('scoreHot')}</option>
            <option value="50">{t('scoreWarm')}</option>
            <option value="20">{t('scoreCold')}</option>
          </select>
          <select
            value={`${filters.sort_by}-${filters.sort_dir}`}
            onChange={(e) => {
              const [sort_by, sort_dir] = e.target.value.split('-')
              handleFilterChange('sort_by', sort_by)
              handleFilterChange('sort_dir', sort_dir)
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
          >
            <option value="current_score-desc">{t('sortHighest')}</option>
            <option value="current_score-asc">{t('sortLowest')}</option>
            <option value="last_interaction-desc">{t('sortRecent')}</option>
            <option value="total_messages-desc">{t('sortMostMessages')}</option>
          </select>
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm transition"
          >
            {t('common:actions.apply')}
          </button>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t('noLeads')}</p>
            <p className="text-sm mt-1">{t('leadsHint')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">{t('lead')}</th>
                <th className="px-4 py-3">{t('score')}</th>
                <th className="px-4 py-3">{t('status')}</th>
                <th className="px-4 py-3">{t('messages')}</th>
                <th className="px-4 py-3">{t('lastActivity')}</th>
                <th className="px-4 py-3">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => {
                const scoreCategory = getScoreCategory(lead.current_score)
                const scoreConfig = SCORE_COLORS[scoreCategory]
                const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new

                return (
                  <tr key={lead.phone} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <span className="text-green-600 font-medium">
                            {lead.contact_name?.[0]?.toUpperCase() || lead.phone.slice(-2)}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">
                            {lead.contact_name || t('noName')}
                          </div>
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {lead.phone}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                          style={{ background: `${scoreConfig.color}20`, color: scoreConfig.color }}
                        >
                          {lead.current_score}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => handleScoreAdjust(lead.phone, 5)}
                            className="p-1 hover:bg-green-100 rounded text-green-600"
                            title={t('addPoints')}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleScoreAdjust(lead.phone, -5)}
                            className="p-1 hover:bg-red-100 rounded text-red-600"
                            title={t('subPoints')}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.phone, e.target.value)}
                        className="px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer"
                        style={{ background: statusConfig.bg, color: statusConfig.color }}
                      >
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                          <option key={key} value={key}>{t(config.labelKey)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <MessageSquare className="w-4 h-4" />
                        {lead.total_messages || lead.message_count || 0}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {lead.last_interaction
                        ? formatDistanceToNow(new Date(lead.last_interaction), {
                            addSuffix: true,
                            locale: getDateLocale()
                          })
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/conversations?phone=${encodeURIComponent(lead.phone)}`)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                        title={t('viewConversation')}
                      >
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
