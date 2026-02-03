import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchStats, fetchConversations } from '../api/conversations'
import StatsCard from '../components/StatsCard'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '../i18n/dateLocale'
import {
  MessageSquare,
  Users,
  Bot,
  Clock,
  ArrowRight
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function Dashboard() {
  const { t } = useTranslation('dashboard')
  const [stats, setStats] = useState(null)
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [statsData, convsData] = await Promise.all([
        fetchStats(),
        fetchConversations()
      ])
      setStats(statsData)
      setConversations(convsData.conversations || [])
    } catch (err) {
      console.error('Error loading dashboard:', err)
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

  const recentConversations = conversations.slice(0, 5)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">{t('title')}</h1>
        <p className="text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title={t('stats.conversations')}
          value={conversations.length}
          icon={MessageSquare}
          color="green"
          subtitle={t('stats.totalActive')}
        />
        <StatsCard
          title={t('stats.uniqueUsers')}
          value={stats?.unique_users || 0}
          icon={Users}
          color="blue"
          subtitle={t('stats.last30Days')}
        />
        <StatsCard
          title={t('stats.interactions')}
          value={stats?.interactions || 0}
          icon={Bot}
          color="purple"
          subtitle={t('stats.processedByBot')}
        />
        <StatsCard
          title={t('stats.confidence')}
          value={`${Math.round((stats?.avg_confidence || 0) * 100)}%`}
          icon={Clock}
          color="yellow"
          subtitle={t('stats.avgClassification')}
        />
      </div>

      {/* Recent Conversations */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">{t('recentConversations')}</h2>
          <Link
            to="/conversations"
            className="text-green-600 hover:text-green-700 text-sm font-medium flex items-center gap-1"
          >
            {t('viewAll')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {recentConversations.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t('noConversationsYet')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentConversations.map((conv) => (
              <Link
                key={conv.phone}
                to={`/conversations?phone=${encodeURIComponent(conv.phone)}`}
                className="flex items-center gap-4 p-4 hover:bg-gray-50 transition"
              >
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-green-600 font-medium">
                    {conv.contact_name?.[0]?.toUpperCase() || conv.phone.slice(-2)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-800 truncate">
                      {conv.contact_name || conv.phone}
                    </p>
                    <span className="text-xs text-gray-400">
                      {conv.last_message_time
                        ? formatDistanceToNow(new Date(conv.last_message_time), {
                            addSuffix: true,
                            locale: getDateLocale()
                          })
                        : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-1">
                    {conv.last_message || t('noMessages')}
                  </p>
                </div>
                {conv.unread_count > 0 && (
                  <span className="bg-green-500 text-white text-xs font-medium px-2 py-1 rounded-full">
                    {conv.unread_count}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Link
          to="/flows"
          className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white hover:from-green-600 hover:to-green-700 transition"
        >
          <h3 className="text-lg font-semibold mb-2">{t('flowEditor')}</h3>
          <p className="text-green-100 text-sm">
            {t('flowEditorDesc')}
          </p>
        </Link>
        <Link
          to="/conversations"
          className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white hover:from-blue-600 hover:to-blue-700 transition"
        >
          <h3 className="text-lg font-semibold mb-2">{t('viewConversations')}</h3>
          <p className="text-blue-100 text-sm">
            {t('viewConversationsDesc')}
          </p>
        </Link>
      </div>
    </div>
  )
}
