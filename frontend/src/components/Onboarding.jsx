import { useState } from 'react'

const steps = [
  {
    title: '¡Bienvenido al Flow Builder!',
    description: 'Crea flujos de conversación para tu chatbot de WhatsApp de forma visual, sin escribir código.',
    icon: '🤖',
    image: null
  },
  {
    title: 'Arrastra nodos al canvas',
    description: 'En la barra izquierda encontrarás los nodos disponibles. Arrástralos al canvas para construir tu flujo.',
    icon: '👆',
    tips: [
      '💬 Mensaje: Envía un texto al usuario',
      '❓ Pregunta: Espera una respuesta del usuario',
      '🔀 Condición: Bifurca el flujo según una variable',
      '⚙️ Acción: Ejecuta una acción (notificar, guardar, etc.)'
    ]
  },
  {
    title: 'Conecta los nodos',
    description: 'Arrastra desde el punto verde (salida) de un nodo hasta el punto gris (entrada) de otro para conectarlos.',
    icon: '🔗',
    tips: [
      'El flujo siempre empieza en el Trigger',
      'Puedes tener múltiples caminos con Condiciones',
      'Termina con un nodo Fin o Transferir'
    ]
  },
  {
    title: 'Configura cada nodo',
    description: 'Haz clic en un nodo para ver sus propiedades a la derecha. Ahí puedes editar el contenido, opciones y variables.',
    icon: '⚙️',
    tips: [
      'Usa {{variable}} para insertar datos dinámicos',
      'Las preguntas guardan la respuesta en una variable',
      'Las condiciones evalúan esas variables'
    ]
  },
  {
    title: '¡Guarda y activa!',
    description: 'Cuando termines, guarda tu flujo y actívalo para que empiece a responder mensajes automáticamente.',
    icon: '🚀',
    tips: [
      'Puedes tener varios flujos, pero solo algunos activos',
      'Usa "Abrir" para cargar flujos guardados',
      'Las plantillas te dan flujos de ejemplo para empezar'
    ]
  }
]

export default function Onboarding({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [showTemplates, setShowTemplates] = useState(false)

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
            ¿Cómo quieres empezar?
          </h2>
          <p style={{ color: '#6b7280', margin: '0 0 24px 0' }}>
            Puedes empezar desde cero o usar una plantilla predefinida
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <TemplateCard
              icon="📄"
              title="Empezar vacío"
              description="Canvas en blanco para crear tu propio flujo"
              onClick={() => handleSelectTemplate(null)}
            />
            <TemplateCard
              icon="💰"
              title="Embudo de Ventas"
              description="Califica leads y guíalos a la compra"
              onClick={() => handleSelectTemplate('sales_funnel')}
              color="#25D366"
            />
            <TemplateCard
              icon="🎧"
              title="Embudo de Soporte"
              description="Resuelve dudas con FAQ y escala a humanos"
              onClick={() => handleSelectTemplate('support_funnel')}
              color="#34B7F1"
            />
            <TemplateCard
              icon="📋"
              title="Captura de Leads"
              description="Recolecta información de contacto"
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
            Saltar y empezar vacío →
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
            Saltar
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
            {isLast ? 'Empezar' : 'Siguiente'}
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
