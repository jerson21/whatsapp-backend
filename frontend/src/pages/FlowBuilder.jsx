import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Toolbar from '../components/Toolbar'
import Sidebar from '../components/Sidebar'
import FlowCanvas from '../components/FlowCanvas'
import PropertiesPanel from '../components/PropertiesPanel'
import ChatSimulator from '../components/ChatSimulator'
import Onboarding from '../components/Onboarding'
import { useFlowStore } from '../store/flowStore'
import { fetchFlow, createFromTemplate } from '../api/flows'

export default function FlowBuilder() {
  const { t } = useTranslation('flowBuilder')
  const { id } = useParams()
  const [showSimulator, setShowSimulator] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [notification, setNotification] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const { loadFlow } = useFlowStore()

  // Load flow from URL param or check if first visit
  useEffect(() => {
    if (id) {
      // Load flow from ID
      loadFlowFromId(id)
    } else {
      // Check if first visit for onboarding
      const hasSeenOnboarding = localStorage.getItem('flowbuilder_onboarding_seen')
      if (!hasSeenOnboarding) {
        setShowOnboarding(true)
      }
    }
  }, [id])

  const loadFlowFromId = async (flowId) => {
    setIsLoading(true)
    try {
      const flowData = await fetchFlow(flowId)
      if (flowData.flow) {
        loadFlow(flowData.flow)
        showNotification(t('flowLoaded', { name: flowData.flow.name }), 'success')
      } else {
        throw new Error(t('errorLoadingFlow'))
      }
    } catch (err) {
      console.error('Error loading flow:', err)
      showNotification(`${t('errorLoadingFlowAlert')}: ${err.message}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const handleOnboardingComplete = async (templateId) => {
    localStorage.setItem('flowbuilder_onboarding_seen', 'true')
    setShowOnboarding(false)

    if (templateId) {
      setIsLoading(true)
      try {
        console.log('Creating flow from template:', templateId)
        const result = await createFromTemplate(templateId, null)
        console.log('Template created, result:', result)

        if (result.id) {
          const flowData = await fetchFlow(result.id)
          console.log('Flow data loaded:', flowData)

          if (flowData.flow) {
            loadFlow(flowData.flow)
            showNotification(t('flowLoaded', { name: flowData.flow.name }), 'success')
          } else {
            throw new Error(t('errorLoadingFlow'))
          }
        } else {
          throw new Error(t('errorNoFlowId'))
        }
      } catch (err) {
        console.error('Error loading template:', err)
        showNotification(`${t('errorLoadingTemplate')}: ${err.message}`, 'error')
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden'
    }}>
      <Toolbar onTestClick={() => setShowSimulator(true)} />

      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden'
      }}>
        <Sidebar />
        <FlowCanvas />
        <PropertiesPanel />
      </div>

      {/* Floating test button */}
      <button
        onClick={() => setShowSimulator(true)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          background: 'linear-gradient(135deg, #075E54 0%, #25D366 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          padding: '14px 24px',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(37, 211, 102, 0.4)',
          fontSize: '14px',
          fontWeight: 600,
          display: showSimulator ? 'none' : 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 100
        }}
      >
        <span style={{ fontSize: '18px' }}>🧪</span>
        {t('testFlow')}
      </button>

      {/* Loading overlay */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001
        }}>
          <div style={{
            background: 'white',
            padding: '24px 32px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              border: '3px solid #e5e7eb',
              borderTop: '3px solid #25D366',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <span>{t('loadingFlow')}</span>
          </div>
        </div>
      )}

      {/* Notification toast */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '12px 20px',
          borderRadius: '8px',
          background: notification.type === 'success' ? '#10b981' :
                      notification.type === 'error' ? '#ef4444' : '#3b82f6',
          color: 'white',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1002,
          animation: 'slideIn 0.3s ease'
        }}>
          {notification.type === 'success' && '✓ '}
          {notification.type === 'error' && '✗ '}
          {notification.message}
        </div>
      )}

      {/* Chat Simulator */}
      <ChatSimulator
        isOpen={showSimulator}
        onClose={() => setShowSimulator(false)}
      />

      {/* Onboarding */}
      {showOnboarding && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
    </div>
  )
}
