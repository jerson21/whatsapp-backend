# CHECKLIST DE IMPLEMENTACIÓN - Plataforma de Conversaciones WhatsApp

**Objetivo**: Construir plataforma completa tipo ManyChat con 9 características principales

**Fecha de inicio**: 2026-01-21
**Estado actual**: 🟢 En desarrollo

---

## ✅ COMPLETADO HOY (2026-01-21)

### Infraestructura Redis + Bull MQ
- [x] ✅ Redis agregado a docker-compose.dev.yml
- [x] ✅ Dependencias bullmq e ioredis instaladas
- [x] ✅ QueueService creado (`queues/queue-service.js`)
- [x] ✅ BroadcastQueue creado (`queues/broadcast-queue.js`)
- [x] ✅ Tablas creadas: `broadcasts`, `broadcast_recipients`, `contact_tags`, `tag_definitions`
- [x] ✅ Endpoints API: `/api/broadcasts`, `/api/tags`, `/api/queues/stats`
- [x] ✅ Backend conectado a Redis y colas funcionando

### Documentación
- [x] ✅ Arquitectura chatbot documentada (`docs/CHATBOT_ARCHITECTURE.md`)
- [x] ✅ Plan de migración legacy → Visual Flows definido

---

## 🎯 FASE 0: Arreglos Inmediatos (URGENTE)

### Problema Actual
- [x] ✅ **BUG FIX: Flujos no ejecutan (modo manual)** - COMPLETADO
  - Cambié DEFAULT a 'automatic' en schema
  - Cambié sesiones existentes a 'automatic'
  - Backend reiniciado

- [ ] 🔧 **PENDIENTE: Duplicación de respuestas**
  - Causa: Chatbot legacy + Visual Flows pueden responder ambos
  - Solución: Desactivar chatbot legacy (ver `docs/CHATBOT_ARCHITECTURE.md`)
  - Archivos: `app-cloud.js`

- [ ] 🔧 **PENDIENTE: Clasificación de intenciones no se usa**
  - MessageClassifier existe pero no hace routing
  - Solución: Integrar en Visual Flow Engine

---

## 📋 FASE 1: Arquitectura Intent-First (Semana 1-2)

**Objetivo**: Eliminar duplicados, routing basado en intenciones

### Backend: Nueva Arquitectura
- [ ] 📝 **Rediseñar webhook handler** (`app-cloud.js`)
  - Clasificar intención ANTES de buscar flujo
  - Cambiar ORCH_BOOT_MODE a 'off' o 'replace'
  - Agregar early return después de cada handler

- [ ] 📝 **Modificar Visual Flow Engine** (`chatbot/visual-flow-engine.js`)
  - Nuevo tipo de trigger: `type: 'intent'`
  - Agregar matching por intent + threshold
  - Mantener compatibilidad con `type: 'keyword'`

- [ ] 📝 **Refactorizar chatbot.js**
  - Eliminar cascada FAQ → Intentions
  - Un solo sistema responde y retorna
  - Logs claros de qué handler respondió

### Testing
- [ ] ✅ **Probar routing por intención**
  - Enviar "tengo un reclamo" → debe ir a flujo de complaint
  - Enviar "quiero comprar" → debe ir a flujo de sales
  - Verificar que NO haya respuestas duplicadas

- [ ] ✅ **Probar fallback**
  - Enviar mensaje sin match → debe ir a flujo default

---

## 📋 FASE 2: Migrar Legacy a Visual Flows (Semana 2-3)

**Objetivo**: Todo editable desde frontend, eliminar código hardcodeado

### Auditoría
- [ ] 📊 **Listar contenido legacy**
  ```sql
  SELECT id, question, answer FROM faq_entries WHERE active = TRUE;
  SELECT id, name, keywords, response FROM chatbot_intentions WHERE active = TRUE;
  ```
  - Exportar a CSV para análisis

### Migración
- [ ] 🤖 **Script de migración automática** (`migrate-legacy-to-visual-flows.js`)
  - Leer FAQ/Intentions de BD
  - Clasificar cada uno con MessageClassifier
  - Generar flujo visual correspondiente
  - Insertar en `visual_flows`
  - Desactivar legacy (no eliminar)

- [ ] 📝 **Crear flujos faltantes**
  - [ ] Flujo: Reclamos (complaint)
  - [ ] Flujo: Información (info)
  - [ ] Flujo: Fallback genérico

### Testing
- [ ] ✅ **Verificar flujos migrados**
  - Probar cada flujo desde frontend
  - Comparar respuestas con legacy
  - Desactivar legacy uno por uno

---

## 📋 FASE 3: Modos Automáticos Basados en Reglas (Semana 3-4)

**Objetivo**: Sistema decide modo según horario, urgencia, tags

### Backend: Rule Engine
- [ ] 📝 **Crear tabla** `chatbot_mode_rules`
  ```sql
  CREATE TABLE chatbot_mode_rules (...)
  ```

- [ ] 📝 **Implementar ModeRuleEngine** (`chatbot/mode-rule-engine.js`)
  - Método `evaluateMode(sessionId, phone, context)`
  - Matching de condiciones: time_range, urgency, tags, message_count
  - Prioridad de reglas (mayor primero)

- [ ] 📝 **Integrar en webhook handler**
  - Evaluar reglas ANTES de ejecutar chatbot
  - Actualizar `chat_sessions.chatbot_mode` dinámicamente

### Frontend: UI para Reglas
- [ ] 🎨 **Nueva página** `frontend/src/pages/ModeRulesManager.jsx`
  - Listar reglas existentes
  - Crear nueva regla (wizard)
  - Editar/eliminar reglas
  - Preview de condiciones

### Reglas por Defecto
- [ ] 📝 **Insertar reglas básicas**
  - Horario laboral → manual
  - Fuera de horario → automatic
  - Alta urgencia → manual inmediato
  - Primera interacción → automatic

---

## 📋 FASE 4: Custom Fields y Persistencia (Semana 4-6)

**Objetivo**: Variables persistentes como ManyChat, continuidad de conversaciones

### Backend: Persistencia
- [ ] 📝 **Crear tablas**
  - [ ] `contact_custom_fields` (variables de usuario)
  - [ ] `flow_session_state` (estado del flujo)

- [ ] 📝 **Modificar VisualFlowEngine**
  - [ ] Método `loadFlowState(sessionId)` - cargar estado existente
  - [ ] Método `continueFlow()` - continuar flujo interrumpido
  - [ ] Método `saveCustomField()` - guardar variables
  - [ ] Método `replaceVariables()` - {{name}} → "Juan"
  - [ ] Método `validateInput()` - validar email, phone, number
  - [ ] Timeout de 24h (configurable)

- [ ] 📝 **Nuevos tipos de nodos**
  - [ ] `question` con `variable` y `validation_type`
  - [ ] `delay` para pausar N segundos

### Frontend: Manager
- [ ] 🎨 **Nueva página** `frontend/src/pages/CustomFieldsManager.jsx`
  - Listar custom fields definidos
  - Crear nuevo field (nombre, tipo, descripción)
  - Editar/eliminar fields
  - Ver en cuántos flujos se usa

- [ ] 🎨 **Actualizar FlowBuilder**
  - Selector de variable en nodos `question`
  - Selector de validation_type
  - Autocomplete de {{variables}} en mensajes

### Testing
- [ ] ✅ **Probar continuidad**
  - Usuario responde 2 preguntas → sale
  - Usuario regresa 1 hora después → debe continuar en pregunta 3
  - Usuario regresa 2 días después → debe reiniciar flujo

- [ ] ✅ **Probar validaciones**
  - Pedir email → rechazar "asdf" → aceptar "juan@ejemplo.com"
  - Pedir teléfono → rechazar "abc" → aceptar "+56912345678"

---

## 📋 FASE 5: Tags y Segmentación (Semana 6-7)

**Objetivo**: Etiquetar usuarios dinámicamente, segmentar audiencias

### Backend: Tags
- [ ] 📝 **Crear tablas**
  - [ ] `contact_tags` (relación phone-tag)
  - [ ] `tag_definitions` (definiciones de tags)

- [ ] 📝 **Nuevos tipos de acción en flujos**
  - [ ] `add_tag` - agregar tags a contacto
  - [ ] `remove_tag` - quitar tags
  - [ ] Condición `has_tag('vip')` en nodos condition

### Frontend: Manager
- [ ] 🎨 **Nueva página** `frontend/src/pages/TagsManager.jsx`
  - Listar tags definidos (con colores)
  - Crear nuevo tag
  - Ver contactos por tag
  - Agregar/quitar tags manualmente (bulk)

- [ ] 🎨 **Actualizar Conversations**
  - Mostrar tags de contacto
  - Filtrar por tags
  - Agregar/quitar tags inline

### Tags Predefinidos
- [ ] 📝 **Insertar tags básicos**
  - vip, lead_hot, lead_cold, interested_product_a, cart_abandoned, support_escalated, inactive_30

---

## 📋 FASE 6: Broadcasts Masivos (Semana 7-9)

**Objetivo**: Envíos masivos programables con segmentación

### Backend: Broadcast Engine
- [ ] 📝 **Crear tablas**
  - [ ] `broadcasts` (campañas)
  - [ ] `broadcast_recipients` (destinatarios)

- [ ] 📝 **Implementar BroadcastEngine** (`chatbot/broadcast-engine.js`)
  - Método `processBroadcast(broadcastId)`
  - Throttling inteligente según tier de WhatsApp
  - Manejo de errores y reintentos

- [ ] 📝 **Scheduler** (`cron/broadcast-scheduler.js`)
  - Cron job cada minuto
  - Buscar broadcasts programados
  - Ejecutar en background

### Frontend: Builder
- [ ] 🎨 **Nueva página** `frontend/src/pages/BroadcastBuilder.jsx`
  - Paso 1: Componer mensaje (con {{variables}})
  - Paso 2: Segmentación (all, tags, custom query)
  - Paso 3: Programación (immediate, scheduled)
  - Vista previa: recipientes, costo estimado

- [ ] 🎨 **Lista de broadcasts**
  - Ver broadcasts enviados
  - Ver métricas: sent, failed, opened
  - Duplicar broadcast

### Testing
- [ ] ✅ **Probar envío inmediato**
  - Crear broadcast a 3 contactos test
  - Verificar que lleguen todos

- [ ] ✅ **Probar programación**
  - Programar para 5 minutos adelante
  - Verificar que se envíe automáticamente

- [ ] ✅ **Probar segmentación**
  - Broadcast solo a tag "vip" → verificar recipientes correctos

---

## 📋 FASE 7: API Externa y Webhooks (Semana 9-10)

**Objetivo**: Integraciones con CRMs, Zapier, Make.com

### Backend: Public API
- [ ] 📝 **Crear tabla** `api_keys`

- [ ] 📝 **Middleware de autenticación**
  - Verificar API Key en header
  - Validar permisos (read:contacts, write:contacts, etc.)

- [ ] 📝 **Endpoints**
  - [ ] GET `/api/v1/contacts/:phone` - info de contacto
  - [ ] POST `/api/v1/contacts/:phone/fields` - actualizar custom fields
  - [ ] POST `/api/v1/contacts/:phone/tags` - agregar tags
  - [ ] POST `/api/v1/messages/send` - enviar mensaje
  - [ ] POST `/api/v1/flows/:id/trigger` - disparar flujo

- [ ] 📝 **Webhooks salientes**
  - Nuevo tipo de nodo: `webhook`
  - Método `executeWebhook()` en VisualFlowEngine
  - Timeout de 10s

### Frontend: API Manager
- [ ] 🎨 **Nueva página** `frontend/src/pages/ApiKeysManager.jsx`
  - Generar nueva API Key
  - Ver keys existentes (ocultar secret)
  - Revocar key
  - Ver logs de uso

### Integraciones Predefinidas
- [ ] 📝 **Módulos de integración** (`integrations/`)
  - [ ] `hubspot.js` - crear contactos en HubSpot
  - [ ] `google-sheets.js` - agregar fila a Google Sheets
  - [ ] `slack.js` - notificar canal de Slack

### Testing
- [ ] ✅ **Probar API endpoints**
  - Crear API key
  - Hacer request con Postman/curl
  - Verificar respuestas

- [ ] ✅ **Probar webhook saliente**
  - Configurar flujo con webhook a webhook.site
  - Ejecutar flujo
  - Verificar payload recibido

---

## 📋 FASE 8: Resúmenes con IA (Semana 10-11)

**Objetivo**: Análisis automático de conversaciones con Claude/OpenAI

### Backend: AI Summarizer
- [ ] 📝 **Crear tabla** `conversation_summaries`

- [ ] 📝 **Implementar ConversationSummarizer** (`chatbot/conversation-summarizer.js`)
  - Método `summarizeConversation(sessionId)`
  - Prompt estructurado para IA
  - Parseo de respuesta JSON

- [ ] 📝 **Integración con Claude API**
  - Configurar API Key en .env
  - Cliente HTTP para llamadas

- [ ] 📝 **Triggers automáticos**
  - Después de 10 mensajes
  - Antes de transferir a humano
  - Timeout de 1 hora sin respuesta

### Frontend: Resumen Panel
- [ ] 🎨 **Actualizar Conversations**
  - Panel de resumen IA
  - Botón "Generar resumen"
  - Mostrar: summary, sentiment, key_points, pain_points, opportunities, suggested_actions

### Testing
- [ ] ✅ **Probar generación**
  - Tener conversación de 10+ mensajes
  - Generar resumen
  - Verificar que capture puntos clave

---

## 📋 FASE 9: Analytics (Semana 11-12)

**Objetivo**: Métricas de conversión, abandono, rendimiento

### Backend: Analytics
- [ ] 📝 **Crear tabla** `flow_analytics_events`

- [ ] 📝 **Tracking en VisualFlowEngine**
  - Evento: flow_started
  - Evento: node_entered
  - Evento: node_completed
  - Evento: flow_completed
  - Evento: flow_abandoned

- [ ] 📝 **Queries de métricas**
  - Tasa de completación por flujo
  - Abandono por nodo
  - Tiempo promedio en flujo

### Frontend: Dashboard
- [ ] 🎨 **Nueva página** `frontend/src/pages/Analytics.jsx`
  - Métricas generales (cards)
  - Gráfico: Conversaciones por día
  - Gráfico: Flujos más usados
  - Tabla: Performance por flujo
  - Funnel visualization

### Testing
- [ ] ✅ **Verificar tracking**
  - Ejecutar flujo completo
  - Verificar eventos en BD
  - Ver métricas en dashboard

---

## 🎨 Frontend: Mejoras Generales

### Layout y Navegación
- [ ] 🎨 **Actualizar Layout.jsx**
  - Agregar links a nuevas páginas:
    - Custom Fields
    - Tags
    - Broadcasts
    - API Keys
    - Mode Rules

### UI/UX
- [ ] 🎨 **Mejoras de FlowBuilder**
  - Drag & drop mejorado
  - Validación en tiempo real
  - Preview de flujo

---

## 🧪 Testing y Deployment

### Testing Integral
- [ ] ✅ **End-to-end tests**
  - Flujo completo desde WhatsApp
  - Captura de lead con validaciones
  - Broadcast a segmento
  - Transferencia a humano con resumen IA

### Performance
- [ ] ⚡ **Optimizaciones**
  - Índices de BD revisados
  - Caching de flujos en memoria
  - Compresión de respuestas API

### Documentación
- [ ] 📚 **Docs de API**
  - OpenAPI/Swagger spec
  - Ejemplos de uso
  - Rate limits

- [ ] 📚 **Manual de usuario**
  - Crear flujo paso a paso
  - Configurar broadcasts
  - Integrar con Zapier

---

## 📊 Progreso Global

**Fases Completadas**: Infraestructura lista

- [x] FASE 0: Arreglos Inmediatos (80%) - Modo automatic OK, falta desactivar legacy
- [ ] FASE 1: Arquitectura Intent-First (10%) - Documentado, pendiente implementar
- [ ] FASE 2: Migrar Legacy (0%)
- [ ] FASE 3: Modos Automáticos (0%)
- [ ] FASE 4: Custom Fields (0%)
- [x] FASE 5: Tags y Segmentación (50%) - Tablas y API creadas
- [x] FASE 6: Broadcasts (60%) - Cola y API creadas, falta UI
- [ ] FASE 7: API y Webhooks (0%)
- [ ] FASE 8: Resúmenes IA (0%)
- [ ] FASE 9: Analytics (10%) - Tabla flow_execution_logs creada

**Infraestructura Completada**:
- ✅ Redis + Bull MQ funcionando
- ✅ 4 colas: broadcast, scheduled-message, webhook, ai-summary
- ✅ API endpoints para broadcasts y tags
- ✅ Documentación de arquitectura

---

## 🚀 Próximos Pasos Inmediatos

1. ✅ **COMPLETADO**: Infraestructura Redis + Bull MQ
2. 🔜 **SIGUIENTE**: Desactivar chatbot legacy en app-cloud.js
3. 🔜 **DESPUÉS**: Agregar trigger por intent en Visual Flow Engine
4. 🔜 **DESPUÉS**: Crear UI para broadcasts en frontend

---

**Última actualización**: 2026-01-21 20:15
