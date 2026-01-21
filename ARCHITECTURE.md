# Arquitectura: Sistema de Chatbot Builder + Calificador

## Visión General

Un sistema SaaS que permite:
1. **Clasificar mensajes entrantes** (intent, urgencia, valor)
2. **Rutear por embudos** (ventas, soporte, información)
3. **Diseñar chatbots visualmente** (drag & drop)

---

## Componentes Principales

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Dashboard   │  │ Flow Builder │  │  Conversation View   │  │
│  │  - Métricas  │  │  - Drag&Drop │  │  - Chat en vivo      │  │
│  │  - Analytics │  │  - Nodos     │  │  - Historial         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   MESSAGE CLASSIFIER                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │   Intent    │  │   Urgency   │  │     Lead Score      │ │ │
│  │  │  Detection  │  │   Detector  │  │     Calculator      │ │ │
│  │  │             │  │             │  │                     │ │ │
│  │  │ - ventas    │  │ - alta      │  │ - comportamiento    │ │ │
│  │  │ - soporte   │  │ - media     │  │ - historial         │ │ │
│  │  │ - info      │  │ - baja      │  │ - engagement        │ │ │
│  │  │ - queja     │  │             │  │                     │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    FLOW ROUTER                              │ │
│  │                                                             │ │
│  │   Mensaje clasificado → Selecciona flujo apropiado         │ │
│  │                                                             │ │
│  │   ┌──────────┐   ┌──────────┐   ┌──────────┐              │ │
│  │   │ Embudo   │   │ Embudo   │   │ Embudo   │              │ │
│  │   │ Ventas   │   │ Soporte  │   │   FAQ    │              │ │
│  │   └──────────┘   └──────────┘   └──────────┘              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  CONVERSATION ENGINE                        │ │
│  │                                                             │ │
│  │   Ejecuta el flujo: nodo por nodo                          │ │
│  │   - Mensajes automáticos                                    │ │
│  │   - Espera respuestas                                       │ │
│  │   - Evalúa condiciones                                      │ │
│  │   - Ejecuta acciones (API calls, guardar datos)            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         INTEGRACIONES                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   WhatsApp   │  │   OpenAI     │  │   APIs Externas      │  │
│  │   Cloud API  │  │   (fallback) │  │   (CRM, tickets)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Message Classifier (Calificador de Mensajes)

### Estructura de Clasificación

```javascript
{
  // Resultado de clasificación
  classification: {
    intent: {
      type: 'sales' | 'support' | 'info' | 'complaint' | 'greeting' | 'unknown',
      confidence: 0.85,
      subIntent: 'price_inquiry'  // más específico
    },
    urgency: {
      level: 'high' | 'medium' | 'low',
      signals: ['palabra_urgente', 'hora_fuera_oficina']
    },
    leadScore: {
      value: 75,  // 0-100
      factors: {
        messageEngagement: 20,
        previousPurchases: 30,
        responseTime: 15,
        intentSignals: 10
      }
    },
    sentiment: 'positive' | 'neutral' | 'negative',
    language: 'es'
  },

  // Metadatos
  originalMessage: "Hola, necesito urgente el precio del producto X",
  timestamp: "2026-01-20T...",
  channel: "whatsapp"
}
```

### Reglas de Clasificación

```sql
-- Tabla: classifier_rules
CREATE TABLE classifier_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  type ENUM('intent', 'urgency', 'lead_score'),

  -- Condiciones (JSON)
  conditions JSON,
  /* Ejemplo:
  {
    "keywords": ["precio", "costo", "cuanto"],
    "patterns": ["cuanto (vale|cuesta)"],
    "exclude": ["no me interesa"]
  }
  */

  -- Resultado
  result_value VARCHAR(50),  -- 'sales', 'high', etc.
  score_modifier INT,        -- Para lead score: +10, -5, etc.
  priority INT DEFAULT 0,

  active BOOLEAN DEFAULT TRUE
);
```

---

## 2. Flow Builder (Diseñador Visual)

### Tipos de Nodos

| Tipo | Descripción | Icono |
|------|-------------|-------|
| `trigger` | Inicio del flujo (mensaje recibido, evento) | ⚡ |
| `message` | Enviar mensaje al usuario | 💬 |
| `question` | Enviar pregunta y esperar respuesta | ❓ |
| `condition` | Bifurcación según condición | 🔀 |
| `action` | Ejecutar acción (API, guardar dato) | ⚙️ |
| `delay` | Esperar tiempo antes de continuar | ⏱️ |
| `transfer` | Transferir a humano | 👤 |
| `end` | Fin del flujo | 🏁 |

### Estructura de Flujo (JSON)

```javascript
{
  id: "flow_ventas_001",
  name: "Embudo de Ventas",
  trigger: {
    type: "classification",
    conditions: {
      intent: "sales",
      leadScore: { min: 50 }
    }
  },
  nodes: [
    {
      id: "node_1",
      type: "message",
      content: "¡Hola! Gracias por tu interés. ¿Sobre qué producto te gustaría saber más?",
      position: { x: 100, y: 100 }
    },
    {
      id: "node_2",
      type: "question",
      content: "¿Cuál es tu presupuesto aproximado?",
      variable: "budget",
      options: [
        { label: "Menos de $50.000", value: "low" },
        { label: "$50.000 - $100.000", value: "medium" },
        { label: "Más de $100.000", value: "high" }
      ],
      position: { x: 100, y: 200 }
    },
    {
      id: "node_3",
      type: "condition",
      conditions: [
        {
          if: "{{budget}} == 'high'",
          goto: "node_4_premium"
        },
        {
          else: true,
          goto: "node_4_standard"
        }
      ],
      position: { x: 100, y: 300 }
    },
    {
      id: "node_4_premium",
      type: "action",
      action: "notify_sales_team",
      payload: {
        priority: "high",
        customer: "{{phone}}",
        budget: "{{budget}}"
      },
      next: "node_5",
      position: { x: 200, y: 400 }
    }
  ],
  connections: [
    { from: "node_1", to: "node_2" },
    { from: "node_2", to: "node_3" },
    { from: "node_3", to: "node_4_premium", label: "budget=high" },
    { from: "node_3", to: "node_4_standard", label: "else" }
  ]
}
```

---

## 3. Embudos Predefinidos

### Embudo de Ventas
```
[Trigger: intent=sales, leadScore>50]
    │
    ▼
[Saludo personalizado]
    │
    ▼
[Preguntar producto de interés]
    │
    ▼
[Mostrar opciones/precios]
    │
    ▼
[Preguntar presupuesto]
    │
    ├── Alto → [Notificar vendedor + Agendar llamada]
    │
    └── Bajo/Medio → [Enviar catálogo + Seguimiento automático]
```

### Embudo de Soporte
```
[Trigger: intent=support]
    │
    ▼
[Identificar tipo de problema]
    │
    ├── FAQ → [Buscar respuesta automática]
    │           │
    │           ├── Encontrada → [Responder + ¿Resuelto?]
    │           │
    │           └── No encontrada → [Crear ticket]
    │
    └── Urgente → [Transferir a humano inmediatamente]
```

---

## 4. Base de Datos

### Tablas Nuevas Necesarias

```sql
-- Reglas de clasificación
CREATE TABLE classifier_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  type ENUM('intent', 'urgency', 'lead_score', 'sentiment') NOT NULL,
  conditions JSON NOT NULL,
  result_value VARCHAR(50),
  score_modifier INT DEFAULT 0,
  priority INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Flujos visuales
CREATE TABLE visual_flows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  trigger_config JSON NOT NULL,
  nodes JSON NOT NULL,
  connections JSON NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Historial de clasificaciones
CREATE TABLE message_classifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(100),
  phone VARCHAR(50),
  message_text TEXT,
  classification JSON,
  flow_triggered VARCHAR(100),
  classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_phone (phone)
);

-- Lead scoring histórico
CREATE TABLE lead_scores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(50) UNIQUE,
  current_score INT DEFAULT 0,
  score_history JSON,
  last_interaction TIMESTAMP,
  total_messages INT DEFAULT 0,
  total_purchases DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 5. API Endpoints Nuevos

### Clasificador
```
GET  /api/classifier/rules          # Listar reglas
POST /api/classifier/rules          # Crear regla
PUT  /api/classifier/rules/:id      # Actualizar regla
POST /api/classifier/test           # Probar clasificación de mensaje
```

### Flow Builder
```
GET  /api/flows                     # Listar flujos
POST /api/flows                     # Crear flujo
GET  /api/flows/:id                 # Obtener flujo
PUT  /api/flows/:id                 # Actualizar flujo
POST /api/flows/:id/activate        # Activar flujo
POST /api/flows/:id/test            # Probar flujo con mensaje simulado
```

### Lead Scoring
```
GET  /api/leads                     # Listar leads con scores
GET  /api/leads/:phone              # Detalle de lead
GET  /api/leads/:phone/history      # Historial de interacciones
```

---

## 6. Roadmap de Implementación

### Fase 1: Clasificador (Semana 1-2)
- [ ] Crear tablas classifier_rules, message_classifications
- [ ] Implementar motor de clasificación
- [ ] API de reglas CRUD
- [ ] Integrar con webhook existente

### Fase 2: Lead Scoring (Semana 2-3)
- [ ] Crear tabla lead_scores
- [ ] Implementar cálculo de score
- [ ] Dashboard básico de leads

### Fase 3: Flow Builder Backend (Semana 3-4)
- [ ] Crear tabla visual_flows
- [ ] Motor de ejecución de flujos visuales
- [ ] API de flujos CRUD

### Fase 4: Frontend React (Semana 4-6)
- [ ] Setup proyecto React
- [ ] Dashboard con métricas
- [ ] Editor visual de flujos (drag & drop)
- [ ] Vista de conversaciones

### Fase 5: Integraciones (Semana 6-8)
- [ ] Conectar con CRM externo
- [ ] Notificaciones (email, slack)
- [ ] Reportes y analytics

---

## Tecnologías

| Componente | Tecnología |
|------------|------------|
| Backend | Node.js + Express (existente) |
| Base de datos | MySQL (existente) |
| Frontend | React + TypeScript |
| Flow Builder | React Flow (librería drag & drop) |
| Estilos | Tailwind CSS |
| Estado | Zustand o React Query |
| Gráficos | Recharts |

---

## Próximos Pasos

1. **Ahora**: Implementar el clasificador de mensajes
2. **Después**: Crear la API de flujos visuales
3. **Frontend**: Proyecto React separado con el editor visual
