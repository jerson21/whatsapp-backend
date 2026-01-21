# FASE 10: Monitor de Flujos en Tiempo Real

## Estado Actual del Proyecto

### Fases Completadas (1-9)
- Fase 1-5: Templates, triggers, logs, leads, analytics
- Fase 6-9: Nuevos nodos (ai_response, webhook, delay), 8 templates, mejoras en simulador

### Fase 10: Monitor en Tiempo Real (EN PROGRESO)

**Objetivo:** Ver en tiempo real por qué nodo está pasando un mensaje mientras se ejecuta el flujo.

---

## PROGRESO DE IMPLEMENTACIÓN

### ✅ COMPLETADO

#### 1. Backend SSE - `api/flow-monitor-routes.js` (CREADO)
Archivo completo con:
- Endpoint SSE `/api/flow-monitor/stream`
- `monitorSubscribers` Set para conexiones activas
- `activeExecutions` Map para cache en memoria
- `emitFlowEvent()` función que broadcast a todos los monitores
- Endpoints adicionales: `/active`, `/recent`, `/stats`

#### 2. Motor de Flujos - `chatbot/visual-flow-engine.js` (MODIFICADO)
Cambios realizados:
- Constructor acepta `emitFlowEvent` como 4to parámetro
- Método `emit()` para enviar eventos al monitor
- Evento `flow_started` en `startFlow()`
- Evento `node_started` al inicio de `executeNode()`
- Evento `node_completed` en `logStep()`

---

### ⏳ PENDIENTE

#### 3. Conectar emitFlowEvent - `chatbot/chatbot.js`
**Qué hacer:**
```javascript
// En chatbot.js, donde se instancia VisualFlowEngine:
// Antes:
const visualFlowEngine = new VisualFlowEngine(pool, classifier, sendMessage);

// Después:
const { emitFlowEvent } = require('../api/flow-monitor-routes')(pool);
const visualFlowEngine = new VisualFlowEngine(pool, classifier, sendMessage, emitFlowEvent);
```

**Nota:** Revisar cómo se exporta y se accede a `emitFlowEvent` desde las rutas.

#### 4. Registrar rutas - `app-cloud.js`
**Qué hacer:**
```javascript
// Agregar después de las otras rutas de API:
const flowMonitorRoutes = require('./api/flow-monitor-routes')(pool);
app.use('/api/flow-monitor', flowMonitorRoutes.router);
```

#### 5. Crear página - `frontend/src/pages/FlowMonitor.jsx`
**Qué hacer:**
- Crear componente React con conexión SSE
- Panel izquierdo: Lista de ejecuciones activas
- Panel central: Visualización del flujo con nodo actual resaltado
- Panel derecho: Timeline de eventos y variables

**Mockup de la interfaz:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Monitor de Flujos en Tiempo Real                               [LIVE] │
├─────────────────┬───────────────────────────────┬───────────────────────┤
│ EJECUCIONES     │ FLUJO VISUAL                  │ DETALLES              │
│                 │                               │                       │
│ ● +56912345678  │    ┌─────────┐               │ Variables:            │
│   Bienvenida    │    │ trigger │               │ ├─ phone: +569...     │
│   Nodo: ask_name│    └────┬────┘               │ ├─ nombre: Juan       │
│                 │         │                    │ └─ interes: comprar   │
│ ○ +56987654321  │    ┌────▼────┐               │                       │
│   E-Commerce    │    │ greeting│               │ Timeline:             │
│   Completado ✓  │    └────┬────┘               │ 14:30:01 trigger ✓    │
│                 │         │                    │ 14:30:02 greeting ✓   │
│                 │    ┌────▼────┐               │ 14:30:03 ask_name ●   │
│                 │    │ask_name │ ← ACTUAL      │                       │
│                 │    └────┬────┘               │                       │
│                 │         │                    │                       │
│                 │    ┌────▼────┐               │                       │
│                 │    │  end    │               │                       │
│                 │    └─────────┘               │                       │
└─────────────────┴───────────────────────────────┴───────────────────────┘
```

#### 6. Agregar ruta - `frontend/src/App.jsx`
**Qué hacer:**
```jsx
import FlowMonitor from './pages/FlowMonitor'

// En las rutas:
<Route path="/monitor" element={<FlowMonitor />} />
```

#### 7. Agregar link en sidebar - `frontend/src/components/Layout.jsx`
**Qué hacer:**
```jsx
// Agregar en el array de navegación:
{ path: '/monitor', label: 'Monitor', icon: '📡' }
```

#### 8. Build y pruebas
**Qué hacer:**
```bash
cd frontend
npm run build
```

Luego probar:
1. Abrir `/monitor` en el navegador
2. Enviar mensaje desde WhatsApp
3. Verificar que se ve la ejecución en tiempo real

---

## EVENTOS SSE DEFINIDOS

| Evento | Cuándo | Datos |
|--------|--------|-------|
| `flow_started` | Al iniciar flujo | flowId, flowName, phone, triggerMessage |
| `node_started` | Al entrar a un nodo | nodeId, nodeType, variables |
| `node_completed` | Al salir de un nodo | nodeId, durationMs, output, status |
| `flow_completed` | Flujo terminado | status, totalDuration, totalNodes |
| `flow_error` | Error en flujo | error, stack |
| `flow_transferred` | Transferido a humano | variables, reason |

---

## ARCHIVOS RELEVANTES

### Creados en Fase 10:
- `api/flow-monitor-routes.js` - API SSE para monitor

### Modificados en Fase 10:
- `chatbot/visual-flow-engine.js` - Emisión de eventos

### Por crear:
- `frontend/src/pages/FlowMonitor.jsx` - Página del monitor

### Por modificar:
- `chatbot/chatbot.js` - Pasar emitFlowEvent al engine
- `app-cloud.js` - Registrar rutas del monitor
- `frontend/src/App.jsx` - Agregar ruta /monitor
- `frontend/src/components/Layout.jsx` - Agregar link en sidebar

---

## ARQUITECTURA DEL SISTEMA

```
WhatsApp → Webhook → chatbot.js → visual-flow-engine.js → Nodos
                                         │
                                         ▼
                                  emitFlowEvent()
                                         │
                                         ▼
                              flow-monitor-routes.js
                                         │
                                         ▼
                              SSE → Frontend Monitor
```

---

## PLAN DETALLADO COMPLETO

El plan técnico completo está en:
`C:\Users\Jerson\.claude\plans\transient-coalescing-music.md`

Contiene:
- Diseño técnico detallado
- Código de ejemplo para cada componente
- Consideraciones de performance y seguridad
- Mockups de la interfaz

---

## PRÓXIMO PASO

Continuar con: **"Modificar chatbot.js para pasar emitFlowEvent"**

Esto conectará el backend para que los eventos fluyan desde el motor de flujos hacia los clientes SSE conectados al monitor.
