import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// ES
import esCommon from './locales/es/common.json'
import esLogin from './locales/es/login.json'
import esConversations from './locales/es/conversations.json'
import esDashboard from './locales/es/dashboard.json'
import esFlows from './locales/es/flows.json'
import esFlowBuilder from './locales/es/flowBuilder.json'
import esLeads from './locales/es/leads.json'
import esAnalytics from './locales/es/analytics.json'
import esMonitor from './locales/es/monitor.json'
import esLogs from './locales/es/logs.json'
import esAgents from './locales/es/agents.json'
import esDepartments from './locales/es/departments.json'
import esLearning from './locales/es/learning.json'

// EN
import enCommon from './locales/en/common.json'
import enLogin from './locales/en/login.json'
import enConversations from './locales/en/conversations.json'
import enDashboard from './locales/en/dashboard.json'
import enFlows from './locales/en/flows.json'
import enFlowBuilder from './locales/en/flowBuilder.json'
import enLeads from './locales/en/leads.json'
import enAnalytics from './locales/en/analytics.json'
import enMonitor from './locales/en/monitor.json'
import enLogs from './locales/en/logs.json'
import enAgents from './locales/en/agents.json'
import enDepartments from './locales/en/departments.json'
import enLearning from './locales/en/learning.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common: esCommon,
        login: esLogin,
        conversations: esConversations,
        dashboard: esDashboard,
        flows: esFlows,
        flowBuilder: esFlowBuilder,
        leads: esLeads,
        analytics: esAnalytics,
        monitor: esMonitor,
        logs: esLogs,
        agents: esAgents,
        departments: esDepartments,
        learning: esLearning
      },
      en: {
        common: enCommon,
        login: enLogin,
        conversations: enConversations,
        dashboard: enDashboard,
        flows: enFlows,
        flowBuilder: enFlowBuilder,
        leads: enLeads,
        analytics: enAnalytics,
        monitor: enMonitor,
        logs: enLogs,
        agents: enAgents,
        departments: enDepartments,
        learning: enLearning
      }
    },
    fallbackLng: 'es',
    defaultNS: 'common',
    ns: [
      'common', 'login', 'conversations', 'dashboard', 'flows',
      'flowBuilder', 'leads', 'analytics', 'monitor', 'logs',
      'agents', 'departments', 'learning'
    ],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
