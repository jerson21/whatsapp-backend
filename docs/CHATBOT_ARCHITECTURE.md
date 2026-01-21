# Arquitectura de Chatbots - Legacy vs Visual Flows

## Estado Actual: 2 Sistemas Compitiendo

### Sistema 1: Legacy Chatbot (`chatbot/chatbot.js`)

**Ubicación**: `chatbot/chatbot.js`

**Componentes**:
- `createChatbot()` - Factory function que crea instancia
- FAQ Store (`faq/faq-store.js`) - Cache en memoria de FAQs
- FAQ Database (`faq/faq-database.js`) - Persistencia MySQL
- Message Classifier (`chatbot/message-classifier.js`) - Clasificación de intenciones

**Flujo de Ejecución**:
```
Mensaje → FAQ Search → Intentions → Default Response
```

**Problemas**:
1. Respuestas hardcodeadas en código
2. Difícil de modificar sin cambiar código
3. Cascada FAQ → Intentions puede causar duplicados
4. No usa clasificación de intenciones para routing

---

### Sistema 2: Visual Flows (`chatbot/visual-flow-engine.js`)

**Ubicación**: `chatbot/visual-flow-engine.js`

**Componentes**:
- `VisualFlowEngine` - Motor de ejecución de flujos
- `visual_flows` tabla - Definiciones de flujos en BD
- Frontend FlowBuilder - Editor visual

**Flujo de Ejecución**:
```
Mensaje → Buscar flujo por keyword/intent → Ejecutar nodos → Respuesta
```

**Ventajas**:
1. Editable desde frontend
2. Nodos configurables (message, question, condition, etc.)
3. Diseñado para escalar

---

## Conflicto Actual

En `app-cloud.js` línea ~3900+, cuando llega un mensaje:

```javascript
// PROBLEMA: Ambos sistemas pueden responder
const chatbot = createChatbot(pool, faqStore, faqDb);  // Legacy
const visualFlowEngine = new VisualFlowEngine(pool);   // Nuevo

// Si el modo es 'automatic':
// 1. Se ejecuta Visual Flow Engine
// 2. SI NO encuentra flujo, SE EJECUTA chatbot legacy
// = RESPUESTAS DUPLICADAS POTENCIALES
```

---

## Recomendación: Deprecar Legacy, Usar Solo Visual Flows

### Fase 1: Desactivar Legacy (Inmediato)

En `app-cloud.js`, cambiar la lógica para que el chatbot legacy NUNCA responda:

```javascript
// ANTES (problemático):
if (!visualFlowHandled) {
  await chatbot.handleMessage(message, phone, sessionId);  // Legacy responde
}

// DESPUÉS (correcto):
if (!visualFlowHandled) {
  // NO usar chatbot legacy
  // Solo registrar que no hubo flujo y continuar
  logger.info({ phone }, 'No visual flow matched, no response sent');
}
```

### Fase 2: Migrar Contenido Legacy a Visual Flows

**Script de migración** (`scripts/migrate-legacy-to-visual-flows.js`):

1. Leer todas las FAQs de `faq_entries`
2. Leer todas las intenciones de `chatbot_intentions`
3. Para cada entrada:
   - Clasificar con MessageClassifier
   - Crear flujo visual equivalente
   - Insertar en `visual_flows`
4. Desactivar entrada legacy

### Fase 3: Eliminar Código Legacy (Futuro)

Una vez migrado todo:

1. Eliminar `chatbot/chatbot.js`
2. Eliminar `faq/faq-store.js`
3. Eliminar `faq/faq-database.js`
4. Eliminar tablas `faq_entries`, `chatbot_intentions`
5. Simplificar `app-cloud.js`

---

## Arquitectura Propuesta: Intent-First

```
┌─────────────────────────────────────────────────────────────┐
│ WEBHOOK WHATSAPP → Guardar mensaje                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. VERIFICAR MODO DE SESIÓN                                 │
│    Si mode='manual' → NO responder, solo guardar            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. CLASIFICAR INTENCIÓN (MessageClassifier)                 │
│    → intent: sales, support, complaint, info, greeting      │
│    → urgency: low, medium, high                             │
│    → sentiment: positive, neutral, negative                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. BUSCAR FLUJO VISUAL POR INTENCIÓN                       │
│    Query: SELECT * FROM visual_flows                        │
│           WHERE trigger_config->>'intent' = ?               │
│           AND is_active = TRUE                              │
│                                                             │
│    Si encuentra → EJECUTAR FLUJO                            │
│    Si NO encuentra → FLUJO FALLBACK                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. EJECUTAR FLUJO VISUAL                                    │
│    → message nodes: enviar texto                            │
│    → question nodes: esperar respuesta                      │
│    → condition nodes: evaluar lógica                        │
│    → action nodes: webhooks, tags, custom fields            │
└─────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

### 1. `app-cloud.js` - Handler principal

**Cambios necesarios**:
- Eliminar imports de chatbot legacy
- Eliminar lógica de fallback a legacy
- Usar SOLO VisualFlowEngine

### 2. `chatbot/visual-flow-engine.js` - Motor de flujos

**Mejoras necesarias**:
- Agregar trigger por intent (no solo keyword)
- Agregar persistencia de estado (`flow_session_state`)
- Agregar custom fields (`contact_custom_fields`)
- Agregar validaciones de input

### 3. Crear `chatbot/intent-router.js` (Nuevo)

**Responsabilidad**:
- Recibir mensaje clasificado
- Buscar flujo por intent
- Retornar flujo a ejecutar o null

---

## Código Legacy a Documentar (Para Referencia Futura)

### `chatbot/chatbot.js`

```javascript
// Este archivo contiene el chatbot legacy
// Funcionalidad principal: FAQ matching + Intenciones

// Métodos importantes:
// - handleMessage(text, phone, sessionId) - Entry point
// - searchFAQ(text) - Buscar en FAQs
// - matchIntention(text) - Buscar intención configurada
// - generateDefaultResponse() - Respuesta cuando no hay match

// ESTADO: DEPRECADO - Usar Visual Flows en su lugar
```

### `faq/faq-store.js`

```javascript
// Cache en memoria de FAQs para búsqueda rápida
// Carga FAQs de la BD al iniciar
// Métodos: search(query), getAll(), refresh()

// ESTADO: DEPRECADO - FAQs deben migrarse a Visual Flows
```

---

## Pasos Inmediatos

1. **HOY**: Desactivar fallback a chatbot legacy en `app-cloud.js`
2. **Esta semana**: Crear flujos visuales para casos comunes
3. **Próxima semana**: Migrar contenido legacy a flujos
4. **Mes 2**: Eliminar código legacy completamente

---

## Checklist de Migración

- [ ] Desactivar chatbot legacy en `app-cloud.js`
- [ ] Crear flujo: Saludo (greeting intent)
- [ ] Crear flujo: Soporte (support intent)
- [ ] Crear flujo: Ventas (sales intent)
- [ ] Crear flujo: Reclamos (complaint intent)
- [ ] Crear flujo: Fallback (cuando no hay match)
- [ ] Migrar FAQs existentes a flujos
- [ ] Migrar intenciones existentes a flujos
- [ ] Probar todos los flujos
- [ ] Eliminar código legacy
- [ ] Eliminar tablas legacy

---

**Última actualización**: 2026-01-21
**Autor**: Claude Code
