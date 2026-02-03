import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function Onboarding({ onComplete }) {
  const { t } = useTranslation('flowBuilder')
  const [currentStep, setCurrentStep] = useState(0)
  const [showTemplates, setShowTemplates] = useState(false)

  const steps = [
    {
      title: t('onboarding.welcome'),
      description: t('onboarding.welcomeDesc'),
      icon: '🤖',
      image: null
    },
    {
      title: t('onboarding.dragNodes'),
      description: t('onboarding.dragNodesDesc'),
      icon: '👆',
      tips: [
        `💬 ${t('onboarding.tipMessage')}`,
        `❓ ${t('onboarding.tipQuestion')}`,
        `🔀 ${t('onboarding.tipCondition')}`,
        `⚙️ ${t('onboarding.tipAction')}`
      ]
    },
    {
      title: t('onboarding.connectNodes'),
      description: t('onboarding.connectNodesDesc'),
      icon: '🔗',
      tips: [
        t('onboarding.tipFlowStartsTrigger'),
        t('onboarding.tipMultiplePaths'),
        t('onboarding.tipEndWithNode')
      ]
    },
    {
      title: t('onboarding.configureNodes'),
      description: t('onboarding.configureNodesDesc'),
      icon: '⚙️',
      tips: [
        t('onboarding.tipUseVariables'),
        t('onboarding.tipQuestionsSave'),
        t('onboarding.tipConditionsEvaluate')
      ]
    },
    {
      title: t('onboarding.saveAndActivate'),
      description: t('onboarding.saveAndActivateDesc'),
      icon: '🚀',
      tips: [
        t('onboarding.tipMultipleFlows'),
        t('onboarding.tipUseOpen'),
        t('onboarding.tipTemplates')
      ]
    }
  ]

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  const handleNext = () => {
    if (isLast) {
      setShowTemplates(true)
    } else {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleSkip = () => {
    onComplete(null)
  }

  const handleSelectTemplate = (templateId) => {
    onComplete(templateId)
  }

  if (showTemplates) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '600px',
          width: '90%'
        }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>
            {t('onboarding.howToStart')}
          </h2>
          <p style={{ color: '#6b7280', margin: '0 0 24px 0' }}>
            {t('onboarding.templateSubtitle')}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <TemplateCard
              icon="📄"
              title={t('onboarding.emptyTemplate')}
              description={t('onboarding.emptyTemplateDesc')}
              onClick={() => handleSelectTemplate(null)}
            />
            <TemplateCard
              icon="💰"
              title={t('onboarding.salesFunnel')}
              description={t('onboarding.salesFunnelDesc')}
              onClick={() => handleSelectTemplate('sales_funnel')}
              color="#25D366"
            />
            <TemplateCard
              icon="🎧"
              title={t('onboarding.supportFunnel')}
              description={t('onboarding.supportFunnelDesc')}
              onClick={() => handleSelectTemplate('support_funnel')}
              color="#34B7F1"
            />
            <TemplateCard
              icon="📋"
              title={t('onboarding.leadCapture')}
              description={t('onboarding.leadCaptureDesc')}
              onClick={() => handleSelectTemplate('lead_capture')}
              color="#f59e0b"
            />
          </div>

          <button
            onClick={() => handleSelectTemplate(null)}
            style={{
              marginTop: '16px',
              padding: '8px',
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: '13px',
              width: '100%'
            }}
          >
            {t('onboarding.skipAndStart')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '500px',
        width: '90%',
        textAlign: 'center'
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          {steps.map((_, idx) => (
            <div
              key={idx}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: idx === currentStep ? '#25D366' : '#e5e7eb',
                transition: 'background 0.2s'
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>
          {step.icon}
        </div>

        {/* Title */}
        <h2 style={{ margin: '0 0 12px 0', fontSize: '24px', color: '#111827' }}>
          {step.title}
        </h2>

        {/* Description */}
        <p style={{ color: '#6b7280', margin: '0 0 20px 0', lineHeight: '1.6' }}>
          {step.description}
        </p>

        {/* Tips */}
        {step.tips && (
          <div style={{
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'left',
            marginBottom: '24px'
          }}>
            {step.tips.map((tip, idx) => (
              <div key={idx} style={{ fontSize: '13px', color: '#4b5563', marginBottom: idx < step.tips.length - 1 ? '8px' : 0 }}>
                {tip}
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={handleSkip}
            style={{
              padding: '12px 24px',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#6b7280'
            }}
          >
            {t('onboarding.skip')}
          </button>
          <button
            onClick={handleNext}
            style={{
              padding: '12px 24px',
              background: '#25D366',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            {isLast ? t('onboarding.start') : t('onboarding.next')}
          </button>
        </div>
      </div>
    </div>
  )
}

function TemplateCard({ icon, title, description, onClick, color }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '16px',
        border: '2px solid #e5e7eb',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        textAlign: 'left'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = color || '#25D366'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = '#e5e7eb'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div style={{ fontSize: '28px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{description}</div>
    </div>
  )
}
