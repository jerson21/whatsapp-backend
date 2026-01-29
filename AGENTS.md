# 🤖 ARQUITECTURA DE AGENTES - Sistema Multi-Sector WhatsApp

**Versión**: 1.0
**Fecha**: 2026-01-23
**Propósito**: Definir agentes inteligentes por sector/departamento para automatización de conversaciones

---

## 📋 ÍNDICE

1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Definición de Agentes por Sector](#definición-de-agentes-por-sector)
4. [Flujos de Conversación](#flujos-de-conversación)
5. [Clasificación de Intenciones](#clasificación-de-intenciones)
6. [Base de Datos y Persistencia](#base-de-datos-y-persistencia)
7. [Implementación Técnica](#implementación-técnica)
8. [Guía de Desarrollo](#guía-de-desarrollo)

---

## 🎯 VISIÓN GENERAL

### ¿Qué son los Agentes?

Los **agentes** son módulos inteligentes especializados que manejan conversaciones automáticas para sectores específicos de la empresa. Cada agente tiene:

- **Personalidad y tono** específico
- **Conocimiento del dominio** (productos, servicios, procesos)
- **Flujos de conversación** predefinidos
- **Intenciones** que puede manejar
- **Acciones** que puede ejecutar (crear tickets, agendar citas, etc.)

### Objetivo

Crear un sistema donde cada departamento (Ventas, Soporte, Cobranza, etc.) tenga su propio agente especializado que pueda:

1. **Clasificar** automáticamente la intención del cliente
2. **Rutear** al agente correcto
3. **Ejecutar flujos** específicos del sector
4. **Escalar** a humanos cuando sea necesario
5. **Aprender** de las conversaciones

---

## 🏗️ ARQUITECTURA DEL SISTEMA

### Flujo General

```
┌──────────────────────────────────────────────────────────────┐
│  WHATSAPP WEBHOOK                                            │
│  Mensaje entrante del cliente                                │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  1. GUARDAR MENSAJE                                          │
│     - Tabla: whatsapp_messages                               │
│     - Crear/actualizar sesión: chat_sessions                 │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  2. VERIFICAR MODO DE SESIÓN                                 │
│     - Si mode='manual' → NO responder (solo notificar)       │
│     - Si mode='automatic' → Continuar con bot                │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  3. CLASIFICAR INTENCIÓN (MessageClassifier)                 │
│     Input: Texto del mensaje                                 │
│     Output:                                                   │
│       - intent: sales, support, billing, complaint, info     │
│       - sector: ventas, soporte, cobranza, reclamos          │
│       - urgency: low, medium, high, critical                 │
│       - sentiment: positive, neutral, negative               │
│       - confidence: 0.0 - 1.0                                │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  4. SELECCIONAR AGENTE                                       │
│     - Buscar agente activo para el sector detectado          │
│     - Cargar configuración del agente (personalidad, límites)│
│     - Inicializar contexto de conversación                   │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  5. BUSCAR FLUJO VISUAL                                      │
│     Query: visual_flows WHERE                                │
│       - trigger_config.intent = detected_intent              │
│       - trigger_config.sector = detected_sector              │
│       - is_active = true                                     │
│       - priority ORDER BY DESC                               │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  6. EJECUTAR FLUJO (VisualFlowEngine)                        │
│     - Procesar nodos secuencialmente                         │
│     - Tipos de nodos:                                        │
│       • message: Enviar texto                                │
│       • question: Esperar respuesta del usuario              │
│       • condition: Evaluar condiciones y bifurcar            │
│       • action: Ejecutar acciones (webhook, tags, etc.)      │
│       • api_call: Llamar APIs externas                       │
│       • delay: Esperar tiempo antes de continuar             │
│       • hand_off: Transferir a agente humano                 │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  7. PERSISTIR ESTADO                                         │
│     - Guardar variables en contact_custom_fields             │
│     - Actualizar flow_session_state                          │
│     - Registrar en flow_execution_logs                       │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  8. ENVIAR RESPUESTA                                         │
│     - Via WhatsApp Cloud API                                 │
│     - Notificar via Socket.IO (SSE) al frontend              │
└──────────────────────────────────────────────────────────────┘
```

---

## 👥 DEFINICIÓN DE AGENTES POR SECTOR

### Estructura de un Agente

```javascript
{
  id: 1,
  name: "AgenteSoporte",
  sector: "soporte",
  display_name: "Asistente de Soporte Técnico",
  description: "Resuelve problemas técnicos y dudas de productos",
  personality: {
    tone: "empático y profesional",
    style: "claro y orientado a soluciones",
    language: "formal pero cercano"
  },
  capabilities: [
    "diagnosticar_problemas",
    "crear_tickets",
    "consultar_estado_orden",
    "resetear_contraseñas"
  ],
  intents_handled: [
    "support",
    "technical_issue",
    "how_to",
    "product_question"
  ],
  escalation_rules: {
    timeout: 300,              // 5 minutos sin respuesta
    keywords: ["hablar con persona", "supervisor"],
    unresolved_after_attempts: 3
  },
  active: true,
  priority: 10
}
```

---

### AGENTE 1: 💼 VENTAS

**Sector**: `ventas`
**Objetivo**: Capturar leads, calificar prospectos, cerrar ventas simples

#### Personalidad
- **Tono**: Entusiasta, persuasivo pero no insistente
- **Estilo**: Consultivo, hace preguntas para entender necesidades
- **Lenguaje**: Profesional y amigable

#### Intenciones que maneja
- `sales` - Consulta sobre productos/precios
- `product_inquiry` - Información de productos específicos
- `quote_request` - Solicitud de cotización
- `purchase_intent` - Intención clara de compra

#### Flujos típicos
1. **Consulta de Producto**
   - Saludo personalizado
   - Capturar qué producto le interesa
   - Mostrar opciones/precios
   - Capturar datos de contacto
   - Agendar seguimiento

2. **Solicitud de Cotización**
   - Recopilar especificaciones
   - Calcular precio estimado
   - Enviar cotización formal
   - Crear oportunidad en CRM

3. **Venta Directa (Productos simples)**
   - Confirmar producto y cantidad
   - Procesar pago
   - Generar orden de compra
   - Enviar confirmación

#### Variables que captura
- `product_interest` (string)
- `budget_range` (string)
- `company_name` (string)
- `company_size` (number)
- `decision_timeframe` (string)
- `lead_score` (number)

#### Acciones que ejecuta
- Crear lead en CRM
- Enviar cotización por email
- Agendar llamada de seguimiento
- Aplicar tags: `lead_caliente`, `interes_producto_X`

---

### AGENTE 2: 🛠️ SOPORTE TÉCNICO

**Sector**: `soporte`
**Objetivo**: Resolver problemas técnicos, responder dudas, crear tickets

#### Personalidad
- **Tono**: Empático, paciente, profesional
- **Estilo**: Paso a paso, orientado a soluciones
- **Lenguaje**: Técnico pero accesible

#### Intenciones que maneja
- `support` - Problema general
- `technical_issue` - Fallo técnico específico
- `how_to` - Cómo hacer X
- `product_question` - Pregunta sobre funcionamiento

#### Flujos típicos
1. **Problema Técnico**
   - Identificar el problema
   - Hacer diagnóstico con preguntas
   - Intentar solución guiada
   - Si no resuelve → Crear ticket
   - Asignar a técnico

2. **Consulta de Estado**
   - Solicitar número de ticket
   - Consultar en sistema
   - Informar estado actual
   - Estimación de resolución

3. **Tutorial / Guía**
   - Identificar qué necesita aprender
   - Enviar video/documento
   - Confirmar comprensión
   - Ofrecer ayuda adicional

#### Variables que captura
- `issue_type` (string)
- `product_affected` (string)
- `error_message` (text)
- `steps_tried` (array)
- `urgency_level` (string)

#### Acciones que ejecuta
- Crear ticket en sistema
- Consultar base de conocimiento
- Enviar documentación/tutoriales
- Escalar a técnico humano
- Aplicar tags: `problema_resuelto`, `requiere_seguimiento`

---

### AGENTE 3: 💰 COBRANZA

**Sector**: `cobranza`
**Objetivo**: Recordar pagos, negociar acuerdos, informar métodos de pago

#### Personalidad
- **Tono**: Firme pero respetuoso
- **Estilo**: Directo, orientado a acción
- **Lenguaje**: Formal y claro

#### Intenciones que maneja
- `billing` - Consulta sobre factura
- `payment` - Información de pago
- `debt` - Deuda pendiente
- `payment_plan` - Plan de pago

#### Flujos típicos
1. **Recordatorio de Pago**
   - Saludar y presentar motivo
   - Informar monto y fecha vencida
   - Ofrecer métodos de pago
   - Capturar compromiso de pago

2. **Consulta de Deuda**
   - Validar identidad
   - Consultar estado de cuenta
   - Informar detalle de deuda
   - Ofrecer plan de pago

3. **Negociación de Plan**
   - Evaluar capacidad de pago
   - Proponer plan de cuotas
   - Generar acuerdo de pago
   - Enviar confirmación

#### Variables que captura
- `outstanding_balance` (number)
- `payment_commitment_date` (date)
- `payment_method` (string)
- `payment_plan_accepted` (boolean)

#### Acciones que ejecuta
- Consultar saldo en sistema financiero
- Generar link de pago
- Registrar compromiso de pago
- Aplicar tags: `pago_comprometido`, `moroso`

---

### AGENTE 4: 😠 RECLAMOS

**Sector**: `reclamos`
**Objetivo**: Gestionar quejas, disculparse, resolver conflictos

#### Personalidad
- **Tono**: Muy empático, conciliador
- **Estilo**: Escucha activa, orientado a reparación
- **Lenguaje**: Formal, respetuoso, humilde

#### Intenciones que maneja
- `complaint` - Queja general
- `refund_request` - Solicitud de reembolso
- `poor_service` - Mala atención
- `defective_product` - Producto defectuoso

#### Flujos típicos
1. **Gestión de Reclamo**
   - Disculparse genuinamente
   - Escuchar detalle del problema
   - Registrar reclamo formal
   - Ofrecer compensación inmediata si aplica
   - Asignar a supervisor

2. **Solicitud de Devolución**
   - Verificar elegibilidad
   - Capturar motivo de devolución
   - Generar RMA (Return Authorization)
   - Informar proceso de devolución

3. **Escalamiento Urgente**
   - Detectar alta frustración
   - Disculparse y validar emoción
   - Transferir INMEDIATAMENTE a supervisor

#### Variables que captura
- `complaint_category` (string)
- `severity` (string)
- `compensation_offered` (string)
- `customer_satisfaction` (number)

#### Acciones que ejecuta
- Crear caso de reclamo
- Aplicar compensación automática (descuento, crédito)
- Notificar a supervisor inmediatamente
- Aplicar tags: `cliente_insatisfecho`, `compensacion_aplicada`

---

### AGENTE 5: ℹ️ INFORMACIÓN GENERAL

**Sector**: `informacion`
**Objetivo**: Responder preguntas generales, direccionar, dar información básica

#### Personalidad
- **Tono**: Amigable, servicial
- **Estilo**: Conciso, informativo
- **Lenguaje**: Casual y cercano

#### Intenciones que maneja
- `greeting` - Saludo inicial
- `info_request` - Solicitud de información
- `hours_location` - Horarios y ubicación
- `general_question` - Pregunta no clasificada

#### Flujos típicos
1. **Saludo Inicial**
   - Dar bienvenida
   - Presentar opciones de ayuda
   - Clasificar necesidad
   - Rutear a agente especializado

2. **Información de Contacto**
   - Horarios de atención
   - Direcciones de sucursales
   - Canales de contacto
   - Redes sociales

3. **FAQ**
   - Buscar en base de conocimiento
   - Responder pregunta frecuente
   - Ofrecer información adicional

#### Variables que captura
- `initial_intent` (string)
- `preferred_contact_method` (string)

#### Acciones que ejecuta
- Rutear a otros agentes
- Registrar primera interacción
- Aplicar tags: `nuevo_contacto`, `clasificado_X`

---

### AGENTE 6: 📦 LOGÍSTICA

**Sector**: `logistica`
**Objetivo**: Seguimiento de envíos, coordinar entregas, resolver problemas de despacho

#### Personalidad
- **Tono**: Eficiente, preciso
- **Estilo**: Informativo, orientado a datos
- **Lenguaje**: Profesional

#### Intenciones que maneja
- `tracking` - Seguimiento de pedido
- `delivery_issue` - Problema con entrega
- `address_change` - Cambio de dirección
- `schedule_delivery` - Agendar entrega

#### Flujos típicos
1. **Consulta de Seguimiento**
   - Solicitar número de orden/tracking
   - Consultar estado en sistema
   - Informar ubicación actual
   - Estimar tiempo de entrega

2. **Cambio de Dirección**
   - Validar que sea posible
   - Capturar nueva dirección
   - Actualizar en sistema
   - Confirmar cambio

3. **Problema de Entrega**
   - Identificar tipo de problema
   - Verificar estado actual
   - Ofrecer solución (reenvío, pickup)
   - Crear caso si es necesario

#### Variables que captura
- `tracking_number` (string)
- `delivery_address` (text)
- `delivery_window_preference` (string)
- `delivery_instructions` (text)

#### Acciones que ejecuta
- Consultar API de courier
- Actualizar dirección de entrega
- Crear caso de entrega fallida
- Aplicar tags: `entrega_pendiente`, `problema_logistico`

---

## 🔄 FLUJOS DE CONVERSACIÓN

### Tipos de Nodos en Visual Flows

#### 1. **message** - Enviar Mensaje
```json
{
  "type": "message",
  "config": {
    "text": "¡Hola! Soy tu asistente de {{sector}}. ¿En qué puedo ayudarte?",
    "delay": 1000
  }
}
```

#### 2. **question** - Hacer Pregunta
```json
{
  "type": "question",
  "config": {
    "text": "¿Cuál es el producto que te interesa?",
    "variable": "product_interest",
    "validation": "required",
    "timeout": 300
  }
}
```

#### 3. **buttons** - Botones Interactivos
```json
{
  "type": "buttons",
  "config": {
    "text": "Selecciona una opción:",
    "buttons": [
      {"id": "opt1", "title": "Ventas"},
      {"id": "opt2", "title": "Soporte"},
      {"id": "opt3", "title": "Cobranza"}
    ],
    "variable": "selected_option"
  }
}
```

#### 4. **condition** - Condición
```json
{
  "type": "condition",
  "config": {
    "variable": "urgency_level",
    "operator": "equals",
    "value": "critical",
    "true_path": "escalate_immediately",
    "false_path": "normal_flow"
  }
}
```

#### 5. **action** - Ejecutar Acción
```json
{
  "type": "action",
  "config": {
    "action": "create_ticket",
    "params": {
      "category": "{{issue_type}}",
      "priority": "{{urgency_level}}",
      "description": "{{issue_description}}"
    }
  }
}
```

#### 6. **api_call** - Llamar API Externa
```json
{
  "type": "api_call",
  "config": {
    "method": "POST",
    "url": "https://api.crm.com/leads",
    "headers": {
      "Authorization": "Bearer {{api_token}}"
    },
    "body": {
      "name": "{{customer_name}}",
      "email": "{{customer_email}}",
      "product": "{{product_interest}}"
    },
    "response_variable": "crm_lead_id"
  }
}
```

#### 7. **hand_off** - Transferir a Humano
```json
{
  "type": "hand_off",
  "config": {
    "department": "soporte_nivel_2",
    "message": "Te estoy conectando con un especialista...",
    "context": {
      "issue_summary": "{{issue_description}}",
      "customer_tier": "{{customer_segment}}"
    }
  }
}
```

#### 8. **delay** - Esperar
```json
{
  "type": "delay",
  "config": {
    "seconds": 5,
    "show_typing": true
  }
}
```

#### 9. **tag** - Aplicar Etiquetas
```json
{
  "type": "tag",
  "config": {
    "action": "add",
    "tags": ["lead_calificado", "interes_producto_premium"]
  }
}
```

---

## 🧠 CLASIFICACIÓN DE INTENCIONES

### Tabla: `intent_classifier_rules`

Reglas para clasificar automáticamente las intenciones de los mensajes.

```sql
CREATE TABLE intent_classifier_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  intent VARCHAR(50) NOT NULL,
  sector VARCHAR(50) NOT NULL,
  keywords JSON NOT NULL,
  patterns JSON,
  priority INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Ejemplos de Reglas

```javascript
// VENTAS
{
  intent: "sales",
  sector: "ventas",
  keywords: ["precio", "cotización", "comprar", "costo", "catálogo", "productos"],
  patterns: [
    "cuánto cuesta",
    "quiero comprar",
    "me interesa"
  ],
  priority: 10
}

// SOPORTE
{
  intent: "support",
  sector: "soporte",
  keywords: ["ayuda", "problema", "no funciona", "error", "falla"],
  patterns: [
    "no puedo",
    "tengo un problema",
    "cómo hago"
  ],
  priority: 10
}

// COBRANZA
{
  intent: "billing",
  sector: "cobranza",
  keywords: ["pago", "factura", "deuda", "cuenta", "cuota"],
  patterns: [
    "cuánto debo",
    "pagar mi",
    "estado de cuenta"
  ],
  priority: 10
}

// RECLAMO
{
  intent: "complaint",
  sector: "reclamos",
  keywords: ["reclamo", "queja", "molesto", "mal servicio", "insatisfecho"],
  patterns: [
    "quiero hablar con",
    "esto es inaceptable",
    "pésimo servicio"
  ],
  priority: 15  // Alta prioridad
}
```

### MessageClassifier - Funcionamiento

**Archivo**: `chatbot/message-classifier.js`

```javascript
async classifyMessage(text) {
  // 1. Normalizar texto
  const normalized = text.toLowerCase().trim();

  // 2. Cargar reglas activas
  const rules = await this.loadRules();

  // 3. Puntuar cada regla
  const scores = rules.map(rule => {
    let score = 0;

    // Buscar keywords
    rule.keywords.forEach(keyword => {
      if (normalized.includes(keyword)) score += 10;
    });

    // Buscar patrones
    rule.patterns.forEach(pattern => {
      if (normalized.includes(pattern)) score += 15;
    });

    return { rule, score };
  });

  // 4. Ordenar por score y prioridad
  const sorted = scores
    .filter(s => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.rule.priority - a.rule.priority;
    });

  // 5. Retornar mejor match
  if (sorted.length === 0) {
    return { intent: 'unknown', sector: 'informacion', confidence: 0 };
  }

  const best = sorted[0];
  return {
    intent: best.rule.intent,
    sector: best.rule.sector,
    confidence: Math.min(best.score / 100, 1.0)
  };
}
```

---

## 💾 BASE DE DATOS Y PERSISTENCIA

### Tablas Principales

#### 1. `agents`
Define los agentes disponibles por sector.

```sql
CREATE TABLE agents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  sector VARCHAR(50) NOT NULL,
  display_name VARCHAR(255),
  description TEXT,
  personality JSON,
  capabilities JSON,
  intents_handled JSON,
  escalation_rules JSON,
  active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (sector)
);
```

#### 2. `visual_flows`
Flujos de conversación configurables visualmente.

```sql
CREATE TABLE visual_flows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  agent_id INT,
  trigger_config JSON NOT NULL,  -- {intent, sector, keywords}
  nodes JSON NOT NULL,            -- Array de nodos del flujo
  variables JSON,                 -- Variables que captura el flujo
  is_active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

#### 3. `flow_session_state`
Estado actual de conversación por sesión.

```sql
CREATE TABLE flow_session_state (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NOT NULL,
  flow_id INT NOT NULL,
  current_node_id VARCHAR(100),
  variables JSON,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
  FOREIGN KEY (flow_id) REFERENCES visual_flows(id),
  INDEX (session_id),
  INDEX (flow_id)
);
```

#### 4. `contact_custom_fields`
Variables personalizadas por contacto.

```sql
CREATE TABLE contact_custom_fields (
  id INT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_value TEXT,
  field_type ENUM('string', 'number', 'boolean', 'date', 'json') DEFAULT 'string',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_phone_field (phone, field_name),
  INDEX (phone)
);
```

#### 5. `flow_execution_logs`
Registro de ejecución de flujos.

```sql
CREATE TABLE flow_execution_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id INT NOT NULL,
  flow_id INT NOT NULL,
  node_id VARCHAR(100),
  node_type VARCHAR(50),
  action VARCHAR(100),
  input_data JSON,
  output_data JSON,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
  FOREIGN KEY (flow_id) REFERENCES visual_flows(id),
  INDEX (session_id),
  INDEX (flow_id),
  INDEX (executed_at)
);
```

---

## 🛠️ IMPLEMENTACIÓN TÉCNICA

### Archivos Principales

```
whatsapp-chat/
├── chatbot/
│   ├── chatbot.js                    # Orquestador principal (limpio, solo visual flows)
│   ├── visual-flow-engine.js         # Motor de ejecución de flujos
│   ├── message-classifier.js         # Clasificador de intenciones
│   ├── agent-manager.js              # 🆕 Gestor de agentes por sector
│   └── flow-executor.js              # 🆕 Ejecutor de nodos individuales
├── agents/
│   ├── base-agent.js                 # 🆕 Clase base para agentes
│   ├── sales-agent.js                # 🆕 Agente de ventas
│   ├── support-agent.js              # 🆕 Agente de soporte
│   ├── billing-agent.js              # 🆕 Agente de cobranza
│   ├── complaints-agent.js           # 🆕 Agente de reclamos
│   ├── logistics-agent.js            # 🆕 Agente de logística
│   └── info-agent.js                 # 🆕 Agente de información
├── api/
│   ├── agents-routes.js              # 🆕 CRUD de agentes
│   ├── flows-routes.js               # CRUD de flujos (ya existe)
│   └── flow-monitor-routes.js        # Monitor de ejecución (ya existe)
└── sql/
    └── agents-setup.sql              # 🆕 Schema + data inicial de agentes
```

### Ejemplo: agent-manager.js

```javascript
class AgentManager {
  constructor(pool) {
    this.pool = pool;
    this.agents = new Map(); // sector -> agent instance
  }

  async loadAgents() {
    const [rows] = await this.pool.query(
      'SELECT * FROM agents WHERE active = TRUE'
    );

    for (const row of rows) {
      const AgentClass = this.getAgentClass(row.sector);
      this.agents.set(row.sector, new AgentClass(row, this.pool));
    }
  }

  getAgentClass(sector) {
    const agentMap = {
      ventas: require('./agents/sales-agent'),
      soporte: require('./agents/support-agent'),
      cobranza: require('./agents/billing-agent'),
      reclamos: require('./agents/complaints-agent'),
      logistica: require('./agents/logistics-agent'),
      informacion: require('./agents/info-agent')
    };
    return agentMap[sector] || agentMap.informacion;
  }

  async selectAgent(classification) {
    const { sector, intent, urgency } = classification;

    // Buscar agente para el sector
    let agent = this.agents.get(sector);

    // Fallback a agente de información
    if (!agent) {
      agent = this.agents.get('informacion');
    }

    return agent;
  }
}

module.exports = AgentManager;
```

### Ejemplo: base-agent.js

```javascript
class BaseAgent {
  constructor(config, pool) {
    this.id = config.id;
    this.name = config.name;
    this.sector = config.sector;
    this.personality = config.personality;
    this.capabilities = config.capabilities;
    this.intentsHandled = config.intents_handled;
    this.escalationRules = config.escalation_rules;
    this.pool = pool;
  }

  async findFlow(classification) {
    const { intent, urgency } = classification;

    const [flows] = await this.pool.query(
      `SELECT * FROM visual_flows
       WHERE agent_id = ?
       AND JSON_CONTAINS(trigger_config, JSON_QUOTE(?), '$.intent')
       AND is_active = TRUE
       ORDER BY priority DESC
       LIMIT 1`,
      [this.id, intent]
    );

    return flows[0] || null;
  }

  async shouldEscalate(sessionState) {
    const rules = this.escalationRules;

    // Timeout
    const timeSinceStart = Date.now() - sessionState.started_at;
    if (timeSinceStart > rules.timeout * 1000) {
      return { escalate: true, reason: 'timeout' };
    }

    // Keywords de escalamiento
    const lastMessage = sessionState.last_user_message?.toLowerCase() || '';
    for (const keyword of rules.keywords || []) {
      if (lastMessage.includes(keyword)) {
        return { escalate: true, reason: 'keyword_match', keyword };
      }
    }

    // Intentos sin resolver
    if (sessionState.attempts >= rules.unresolved_after_attempts) {
      return { escalate: true, reason: 'max_attempts' };
    }

    return { escalate: false };
  }

  async executeCapability(capability, params) {
    // Método abstracto, cada agente lo implementa
    throw new Error('Must implement executeCapability');
  }
}

module.exports = BaseAgent;
```

---

## 📝 GUÍA DE DESARROLLO

### Cómo Agregar un Nuevo Agente

#### Paso 1: Definir el Agente en BD

```sql
INSERT INTO agents (name, sector, display_name, description, personality, capabilities, intents_handled, escalation_rules, priority)
VALUES (
  'AgenteNuevoSector',
  'nuevo_sector',
  'Asistente de Nuevo Sector',
  'Descripción de qué hace este agente',
  JSON_OBJECT(
    'tone', 'profesional',
    'style', 'eficiente',
    'language', 'formal'
  ),
  JSON_ARRAY('capacidad1', 'capacidad2'),
  JSON_ARRAY('intent1', 'intent2'),
  JSON_OBJECT(
    'timeout', 300,
    'keywords', JSON_ARRAY('supervisor', 'humano'),
    'unresolved_after_attempts', 3
  ),
  10
);
```

#### Paso 2: Crear Clase del Agente

```javascript
// agents/nuevo-sector-agent.js
const BaseAgent = require('./base-agent');

class NuevoSectorAgent extends BaseAgent {
  async executeCapability(capability, params) {
    switch(capability) {
      case 'capacidad1':
        return await this.handleCapacidad1(params);
      case 'capacidad2':
        return await this.handleCapacidad2(params);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  async handleCapacidad1(params) {
    // Implementar lógica específica
  }

  async handleCapacidad2(params) {
    // Implementar lógica específica
  }
}

module.exports = NuevoSectorAgent;
```

#### Paso 3: Registrar en AgentManager

```javascript
// agent-manager.js
getAgentClass(sector) {
  const agentMap = {
    // ...existentes
    nuevo_sector: require('./agents/nuevo-sector-agent')
  };
  return agentMap[sector] || agentMap.informacion;
}
```

#### Paso 4: Crear Reglas de Clasificación

```sql
INSERT INTO intent_classifier_rules (intent, sector, keywords, patterns, priority)
VALUES (
  'intent_nuevo',
  'nuevo_sector',
  JSON_ARRAY('keyword1', 'keyword2'),
  JSON_ARRAY('patrón1', 'patrón2'),
  10
);
```

#### Paso 5: Crear Flujos Visuales

Desde el frontend (FlowBuilder) o mediante script:

```javascript
// migrate-flows-nuevo-sector.js
const flows = [
  {
    name: 'Flujo Principal - Nuevo Sector',
    agent_id: 7, // ID del agente nuevo
    trigger_config: {
      intent: 'intent_nuevo',
      sector: 'nuevo_sector'
    },
    nodes: [
      {
        id: 'start',
        type: 'message',
        config: { text: '¡Hola! Soy el asistente de Nuevo Sector' },
        next: 'q1'
      },
      {
        id: 'q1',
        type: 'question',
        config: { text: '¿En qué puedo ayudarte?', variable: 'help_needed' },
        next: 'handle'
      }
      // ... más nodos
    ]
  }
];
```

---

### Cómo Crear un Flujo Visual

#### Opción 1: Desde Frontend (Recomendado)

1. Ir a `/flows-manager`
2. Click en "Crear Nuevo Flujo"
3. Arrastar nodos desde la paleta
4. Conectar nodos
5. Configurar cada nodo
6. Guardar

#### Opción 2: Por Script

```javascript
const flowDefinition = {
  name: 'Consulta de Producto - Ventas',
  description: 'Cliente pregunta por un producto específico',
  agent_id: 1, // Agente de Ventas
  trigger_config: {
    intent: 'product_inquiry',
    sector: 'ventas',
    keywords: ['producto', 'precio', 'disponibilidad']
  },
  nodes: [
    {
      id: 'start',
      type: 'message',
      config: {
        text: '¡Hola! 👋 Soy tu asesor de ventas. ¿Qué producto te interesa?'
      },
      next: 'capture_product'
    },
    {
      id: 'capture_product',
      type: 'question',
      config: {
        text: 'Por favor, dime el nombre del producto:',
        variable: 'product_name',
        validation: 'required'
      },
      next: 'search_product'
    },
    {
      id: 'search_product',
      type: 'action',
      config: {
        action: 'search_product_db',
        params: { name: '{{product_name}}' },
        result_variable: 'product_info'
      },
      next: 'check_found'
    },
    {
      id: 'check_found',
      type: 'condition',
      config: {
        variable: 'product_info',
        operator: 'exists',
        true_path: 'show_product',
        false_path: 'not_found'
      }
    },
    {
      id: 'show_product',
      type: 'message',
      config: {
        text: `Encontré el producto: {{product_info.name}}
Precio: ${{product_info.price}}
Stock: {{product_info.stock}} unidades

¿Te gustaría comprarlo?`
      },
      next: 'ask_purchase'
    },
    {
      id: 'not_found',
      type: 'message',
      config: {
        text: 'No encontré ese producto. ¿Quieres que te muestre el catálogo completo?'
      },
      next: 'end'
    }
    // ... más nodos
  ],
  variables: {
    product_name: { type: 'string', required: true },
    product_info: { type: 'object' },
    wants_to_buy: { type: 'boolean' }
  },
  is_active: true,
  priority: 10
};

await pool.query('INSERT INTO visual_flows SET ?', flowDefinition);
```

---

## 🎯 CASOS DE USO COMPLETOS

### Caso 1: Cliente Pregunta por Precio

```
Cliente: "Hola, cuánto cuesta el plan premium?"

→ MessageClassifier detecta:
  - intent: sales
  - sector: ventas
  - confidence: 0.92

→ AgentManager selecciona: AgenteVentas

→ AgenteVentas busca flow con trigger:
  - intent: sales
  - keywords: ["precio", "cuesta"]

→ Ejecuta flujo "Consulta de Precios":

  [BOT] ¡Hola! Soy Juan, tu asesor de ventas 😊
        El Plan Premium cuesta $99/mes e incluye:
        ✓ Usuarios ilimitados
        ✓ 10,000 mensajes/mes
        ✓ Soporte prioritario

        ¿Te gustaría una demo?

  [USUARIO] Sí, me interesa

  [BOT] Perfecto! Para agendar la demo necesito:
        - Tu nombre completo
        - Email
        - Nombre de tu empresa

  [USUARIO] Jerson Morales, jerson@empresa.com, AcmeCorp

  [BOT → ACTION] Crear lead en CRM
  [BOT → ACTION] Agendar demo en calendario
  [BOT → TAG] Aplicar: lead_calificado, interes_plan_premium

  [BOT] ¡Listo Jerson! 🎉
        Te agendé una demo para mañana a las 10:00 AM.
        Te llegará un email de confirmación a jerson@empresa.com

        ¿Algo más en lo que pueda ayudarte?
```

### Caso 2: Cliente con Problema Técnico Urgente

```
Cliente: "URGENTE! No puedo acceder a mi cuenta, necesito ayuda YA"

→ MessageClassifier detecta:
  - intent: support
  - sector: soporte
  - urgency: critical
  - sentiment: negative
  - confidence: 0.95

→ AgentManager selecciona: AgenteSoporte

→ AgenteSoporte evalúa urgency=critical → Escalamiento automático

→ Ejecuta flujo "Soporte Urgente":

  [BOT] Entiendo que es urgente. Te estoy conectando
        INMEDIATAMENTE con un técnico especializado.

  [BOT → ACTION] Crear ticket URGENTE
  [BOT → ACTION] Notificar a técnico de guardia
  [BOT → MODE] Cambiar session a 'manual'

  [SISTEMA] Sesión transferida a: TécnicoJuan (online)

  [TécnicoJuan] Hola, soy Juan del equipo técnico.
                Vi que no puedes acceder. ¿Qué mensaje
                de error ves?
```

### Caso 3: Cliente Moroso (Cobranza)

```
Sistema inicia conversación (broadcast programado):

[BOT - AgenteCobranza] Hola Juan, te contacto de Finanzas AcmeCorp.

                        Tenemos registrado un saldo pendiente de $150
                        con vencimiento del 15/01/2026.

                        ¿Podemos coordinar el pago?

[USUARIO] Sí, disculpa. ¿Puedo pagar en 2 cuotas?

[BOT] Claro! Podemos hacer 2 cuotas de $75 c/u

      Fechas propuestas:
      - 1era cuota: 25/01/2026
      - 2da cuota: 10/02/2026

      ¿Te parece bien?

[USUARIO] Perfecto

[BOT → ACTION] Crear plan de pagos en sistema
[BOT → ACTION] Generar links de pago
[BOT → TAG] Aplicar: plan_pago_activo

[BOT] Excelente! 🎉

      Te envié los links de pago a tu email.
      Cuota 1 ($75): [link]
      Cuota 2 ($75): [link]

      Te recordaré 1 día antes de cada vencimiento.
      ¡Gracias por tu compromiso!
```

---

## 🚀 PRÓXIMOS PASOS

### Fase 1: Setup Inicial (Semana 1-2)
- [ ] Crear tabla `agents`
- [ ] Crear módulo `agent-manager.js`
- [ ] Crear clase `base-agent.js`
- [ ] Migrar clasificación de intenciones a tabla
- [ ] Integrar AgentManager en `chatbot.js`

### Fase 2: Agentes Básicos (Semana 3-4)
- [ ] Implementar `sales-agent.js`
- [ ] Implementar `support-agent.js`
- [ ] Implementar `info-agent.js`
- [ ] Crear flujos básicos para cada agente
- [ ] Probar clasificación y routing

### Fase 3: Agentes Avanzados (Semana 5-6)
- [ ] Implementar `billing-agent.js`
- [ ] Implementar `complaints-agent.js`
- [ ] Implementar `logistics-agent.js`
- [ ] Crear flujos avanzados con API calls

### Fase 4: Optimización (Semana 7-8)
- [ ] Agregar analytics por agente
- [ ] Optimizar clasificador con ML
- [ ] Dashboard de performance de agentes
- [ ] A/B testing de flujos

---

## 📚 RECURSOS

### Archivos Relacionados
- [chatbot.js](chatbot/chatbot.js) - Orquestador principal
- [visual-flow-engine.js](chatbot/visual-flow-engine.js) - Motor de flujos
- [message-classifier.js](chatbot/message-classifier.js) - Clasificador
- [CHATBOT_ARCHITECTURE.md](docs/CHATBOT_ARCHITECTURE.md) - Arquitectura legacy vs visual flows
- [ANALISIS_Y_MEJORAS_PLAN.md](ANALISIS_Y_MEJORAS_PLAN.md) - Plan de 9 fases

### Variables de Entorno Necesarias
```bash
# Agentes
AGENTS_ENABLED=true
DEFAULT_AGENT=informacion

# Clasificador
CLASSIFIER_CONFIDENCE_THRESHOLD=0.6
CLASSIFIER_USE_ML=false  # Futuro: usar modelo ML

# Escalamiento
AUTO_ESCALATE_CRITICAL=true
AUTO_ESCALATE_TIMEOUT=300
```

---

**Última actualización**: 2026-01-23
**Autor**: Jerson + Claude Code
**Versión**: 1.0
