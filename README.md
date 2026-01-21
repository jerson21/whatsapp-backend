# WhatsApp Chat Backend - Respaldos Chile

Backend para integrar WhatsApp Business Cloud API con un sistema de chatbot inteligente, clasificacion de mensajes y flujos conversacionales automatizados.

## Descripcion

Este proyecto es un sistema SaaS completo que permite:

- **Recibir y enviar mensajes** via WhatsApp Cloud API (Meta)
- **Clasificar mensajes entrantes** automaticamente (intent, urgencia, lead score)
- **Gestionar conversaciones** con panel de administracion en tiempo real
- **Crear flujos conversacionales** con editor visual drag-and-drop
- **Sistema de FAQ** con busqueda BM25 integrada
- **Chatbot con IA** integrado (OpenAI GPT)
- **Flow Builder** visual con 10 tipos de nodos
- **Sistema de Leads** con captura y scoring automatico
- **Analytics** con metricas de flujos y conversiones

---

## Caracteristicas Principales

- **WhatsApp Cloud API**: Integracion completa con Meta para envio/recepcion de mensajes
- **Clasificador de Mensajes**: Detecta intenciones (ventas, soporte, info, queja)
- **Lead Scoring**: Calcula puntaje de leads basado en comportamiento
- **Motor de Flujos**: Ejecuta flujos conversacionales nodo por nodo
- **FAQ Inteligente**: Busqueda semantica con algoritmo BM25
- **Panel Admin**: Interfaz web para gestionar conversaciones
- **Rate Limiting**: Proteccion contra abuso de API
- **SSE Streaming**: Actualizaciones en tiempo real via Server-Sent Events
- **Flow Builder Visual**: Editor drag-and-drop con ReactFlow
- **Integracion IA**: Nodos con respuestas dinamicas via OpenAI
- **Webhooks**: Llamadas a APIs externas desde flujos
- **Sistema de Logs**: Historial completo de ejecuciones

---

## Requisitos

### Obligatorios

- **Node.js** >= 18.x
- **MySQL** >= 8.0
- **npm** o **yarn**

### Opcionales

- **Docker** (para MySQL local de desarrollo)
- **PM2** (para produccion)
- **OpenAI API Key** (para funciones de IA)

---

## Instalacion

### 1. Clonar el repositorio

```bash
git clone <repositorio>
cd whatsapp-chat
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copiar el archivo de ejemplo y editar:

```bash
cp .env.production .env
```

Editar `.env` con tus credenciales (ver seccion Configuracion).

### 4. Iniciar base de datos (Docker)

Si usas Docker para desarrollo local:

```bash
npm run db:start
```

Esto levanta MySQL en el puerto 3307.

### 5. Ejecutar migraciones

```bash
npm run setup
```

Este comando ejecuta todas las migraciones necesarias:
- `migrate-chatbot-tables.js` - Tablas del chatbot
- `migrate-faq-data.js` - Datos iniciales de FAQ
- `migrate-categories.js` - Categorias de conversaciones
- `migrate-classifier.js` - Reglas del clasificador

### 6. Iniciar la aplicacion

```bash
# Desarrollo
npm run dev

# Produccion
npm start
```

---

## Configuracion (.env)

```env
# ============================================
# APLICACION
# ============================================
PORT=3001
LOG_LEVEL=debug                    # debug | info | warn | error
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# ============================================
# PANEL ADMIN
# ============================================
ADMIN_USER=admin
ADMIN_PASS=tu_password_seguro

# ============================================
# BASE DE DATOS MySQL
# ============================================
DB_HOST=127.0.0.1
DB_PORT=3307                       # 3307 para Docker local, 3306 para produccion
DB_USER=dev
DB_PASS=dev123
DB_NAME=whatsapp_chat

# ============================================
# API EXTERNA - SISTEMA PRINCIPAL
# ============================================
MAIN_API_BASE=https://respaldoschile.cl/onlinev2/api

# ============================================
# WHATSAPP CLOUD API (META)
# ============================================
GRAPH_API_VERSION=v22.0
WABA_PHONE_NUMBER_ID=tu_phone_number_id
META_ACCESS_TOKEN=tu_access_token
META_VERIFY_TOKEN=tu_verify_token
META_APP_SECRET=tu_app_secret

# ============================================
# CHATBOT IA (OPCIONAL)
# ============================================
OPENAI_API_KEY=sk-...
CHATBOT_MODE_DEFAULT=manual        # manual | auto
CHATBOT_AI_MODEL=gpt-4o-mini
CHATBOT_AI_TEMPERATURE=0.1
CHATBOT_AI_MAX_TOKENS=50
CHATBOT_AUTO_REPLY_DELAY=2000

# ============================================
# FEATURE FLAGS
# ============================================
CHATBOT_GLOBAL_ENABLED=false
CHATBOT_AUTO=false
INTENT_DETECT_ENABLED=false
ROUTING_ENABLED=false
RAG_ENABLED=false
```

---

## Scripts Disponibles

| Script | Comando | Descripcion |
|--------|---------|-------------|
| `dev` | `npm run dev` | Inicia en modo desarrollo |
| `start` | `npm start` | Inicia en modo produccion (512MB max) |
| `db:start` | `npm run db:start` | Levanta MySQL con Docker |
| `db:stop` | `npm run db:stop` | Detiene contenedor MySQL |
| `db:logs` | `npm run db:logs` | Ver logs de MySQL |
| `setup` | `npm run setup` | Ejecuta todas las migraciones |
| `migrate:classifier` | `npm run migrate:classifier` | Migra solo reglas del clasificador |
| `pm2:start` | `npm run pm2:start` | Inicia con PM2 |
| `pm2:restart` | `npm run pm2:restart` | Reinicia con PM2 |
| `pm2:stop` | `npm run pm2:stop` | Detiene PM2 |
| `pm2:logs` | `npm run pm2:logs` | Ver logs de PM2 |

---

## APIs Disponibles

### Health & Status

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/` | Estado del servicio |
| GET | `/api/health` | Health check |
| GET | `/status` | Estado detallado (requiere auth) |

### Chat & Mensajes

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/chat/send` | Enviar mensaje de texto |
| POST | `/api/chat/send-media` | Enviar archivo multimedia |
| POST | `/api/chat/send-template` | Enviar template de WhatsApp |
| GET | `/api/chat/history` | Historial de mensajes |
| GET | `/api/chat/conversations` | Lista de conversaciones |
| GET | `/api/chat/conversations/:phone` | Detalle de conversacion |
| GET | `/api/chat/stream` | SSE stream de mensajes |
| GET | `/api/chat/inbox-stream` | SSE stream de inbox |

### Sesiones

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/chat/session` | Crear/obtener sesion |
| POST | `/api/chat/mark-read` | Marcar como leido |
| POST | `/api/chat/panel-seen` | Marcar visto en panel |
| POST | `/api/chat/reset-escalation` | Resetear escalamiento |

### FAQ

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/faq/list` | Listar FAQs |
| GET | `/api/faq/search` | Buscar en FAQs |
| POST | `/api/faq/ingest` | Agregar FAQ |
| PUT | `/api/faq/update/:id` | Actualizar FAQ |
| DELETE | `/api/faq/delete/:id` | Eliminar FAQ |
| GET | `/api/faq/export` | Exportar FAQs |
| POST | `/api/faq/import` | Importar FAQs |
| POST | `/api/faq/backup` | Backup de FAQs |
| GET | `/api/faq/stats` | Estadisticas de FAQs |

### Chatbot & Configuracion

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/chatbot/config` | Obtener configuracion |
| PUT | `/api/chatbot/config` | Actualizar configuracion |
| GET | `/api/chatbot/intentions` | Listar intenciones |
| POST | `/api/chatbot/intentions` | Crear intencion |
| PUT | `/api/chatbot/intentions/:id` | Actualizar intencion |
| DELETE | `/api/chatbot/intentions/:id` | Eliminar intencion |
| POST | `/api/chatbot/test` | Probar clasificacion |
| GET | `/api/chatbot/stats` | Estadisticas |

### Categorias

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/chat/categories` | Listar categorias |
| POST | `/api/chat/categorize` | Categorizar conversacion |
| GET | `/api/chat/conversations-by-category` | Filtrar por categoria |
| GET | `/api/chat/category-stats` | Estadisticas por categoria |

### Templates de Respuesta

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/chat/template-responses` | Listar templates |
| POST | `/api/chat/template-responses` | Crear template |
| PUT | `/api/chat/template-responses/:id` | Actualizar template |
| DELETE | `/api/chat/template-responses/:id` | Eliminar template |
| GET | `/api/chat/template-names` | Nombres de templates WA |
| GET | `/api/chat/templates` | Templates de WhatsApp |

### Webhook WhatsApp

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/webhook` | Verificacion de Meta |
| POST | `/webhook` | Recepcion de mensajes |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENTES                                    │
│         (WhatsApp Users / Panel Admin / Frontend React)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS.JS SERVER                             │
│                      (app-cloud.js)                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Webhook   │  │   REST API  │  │   Static Files          │  │
│  │   Handler   │  │   Routes    │  │   (/editor, /chatbot)   │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘  │
│         │                │                                       │
│         ▼                ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              MESSAGE CLASSIFIER                             │ │
│  │   ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐  │ │
│  │   │  Intent  │  │ Urgency  │  │      Lead Score         │  │ │
│  │   │ Detector │  │ Detector │  │      Calculator         │  │ │
│  │   └──────────┘  └──────────┘  └─────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              CONVERSATION ENGINE                            │ │
│  │                                                             │ │
│  │   Ejecuta flujos: mensaje -> clasificacion -> respuesta    │ │
│  │   - Busqueda FAQ (BM25)                                    │ │
│  │   - Respuestas automaticas                                 │ │
│  │   - Escalamiento a humanos                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     CHATBOT MODULE                          │ │
│  │                                                             │ │
│  │   - Logica de respuestas automaticas                       │ │
│  │   - Integracion con OpenAI (opcional)                      │ │
│  │   - Manejo de contexto de sesion                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │   MySQL   │   │  WhatsApp │   │  OpenAI   │
       │ Database  │   │ Cloud API │   │   API     │
       └───────────┘   └───────────┘   └───────────┘
```

---

## Estructura de Carpetas

```
whatsapp-chat/
├── api/                          # Rutas de API modularizadas
│   ├── classifier-routes.js      # Endpoints del clasificador
│   ├── flows-routes.js           # Endpoints de flujos
│   ├── conversation-flows.js     # Logica de flujos v1
│   ├── conversation-flows-v2.js  # Logica de flujos v2
│   └── conversation-flows-config-v2.js
│
├── chatbot/                      # Modulo de chatbot
│   ├── chatbot.js                # Logica principal del bot
│   ├── conversation-engine.js    # Motor de conversaciones
│   └── message-classifier.js     # Clasificador de mensajes
│
├── faq/                          # Sistema de FAQ
│   ├── faq-database.js           # Persistencia de FAQs
│   └── faq-store.js              # Busqueda BM25
│
├── public/                       # Archivos estaticos
│   ├── chatbot/                  # Frontend React del chatbot
│   ├── editor/                   # Editor visual de flujos
│   └── conversation-debugger/    # Debugger de conversaciones
│
├── sql/                          # Scripts SQL
│
├── app-cloud.js                  # Archivo principal del servidor
├── package.json                  # Dependencias y scripts
├── ecosystem.config.js           # Configuracion PM2
├── docker-compose.dev.yml        # Docker para desarrollo
├── .env                          # Variables de entorno (local)
├── .env.production               # Variables de entorno (produccion)
│
├── migrate-chatbot-tables.js     # Migracion: tablas chatbot
├── migrate-faq-data.js           # Migracion: datos FAQ
├── migrate-categories.js         # Migracion: categorias
├── migrate-classifier.js         # Migracion: clasificador
│
├── deploy.sh                     # Script de despliegue
├── setup.sh                      # Script de setup inicial
└── ARCHITECTURE.md               # Documentacion de arquitectura
```

---

## Desarrollo Local vs Produccion

### Desarrollo Local

1. **Base de datos**: Usa Docker con puerto 3307

   ```bash
   npm run db:start
   ```

2. **Servidor**: Ejecutar con nodemon o directamente

   ```bash
   npm run dev
   ```

3. **Variables de entorno**: Usar `.env` con configuracion local
   - `DB_PORT=3307`
   - `LOG_LEVEL=debug`
   - `CHATBOT_GLOBAL_ENABLED=false`

4. **WhatsApp**: Puede funcionar sin credenciales de Meta (modo offline)

### Produccion

1. **Base de datos**: MySQL en servidor de produccion
   - `DB_PORT=3306`
   - Credenciales seguras

2. **Servidor**: Usar PM2 para proceso persistente

   ```bash
   npm run pm2:start
   ```

3. **Variables de entorno**: Usar `.env.production`
   - `LOG_LEVEL=info`
   - `CHATBOT_GLOBAL_ENABLED=true` (si corresponde)
   - Credenciales de Meta configuradas

4. **Memory**: Limite de 512MB en start, 1GB con PM2

5. **Logs**: PM2 guarda logs en `./logs/`

---

## Dependencias Principales

| Paquete | Version | Uso |
|---------|---------|-----|
| express | ^4.19.2 | Framework web |
| mysql2 | ^3.9.7 | Driver MySQL con Promises |
| pino | ^8.19.0 | Logger de alto rendimiento |
| cors | ^2.8.5 | Middleware CORS |
| dotenv | ^16.4.5 | Variables de entorno |
| express-rate-limit | ^7.4.0 | Rate limiting |
| multer | 1.4.5-lts.1 | Upload de archivos |
| undici | ^6.19.8 | Cliente HTTP moderno |

---

---

## Flow Builder Visual

El Flow Builder es un editor visual drag-and-drop para crear flujos conversacionales sin codigo.

### Acceso

```
http://tu-servidor:3001/flow-builder/
```

### Tipos de Nodos (10 disponibles)

| Nodo | Icono | Color | Descripcion |
|------|-------|-------|-------------|
| **Trigger** | ⚡ | Violeta | Punto de inicio del flujo. Se activa por keywords, clasificacion o siempre |
| **Mensaje** | 💬 | Verde | Envia un mensaje de texto al usuario |
| **Pregunta** | ❓ | Azul | Hace una pregunta y espera respuesta. Guarda en variable |
| **Condicion** | 🔀 | Amarillo | Bifurca el flujo segun condiciones logicas |
| **Accion** | ⚙️ | Indigo | Ejecuta acciones del backend (guardar lead, webhook, etc.) |
| **Respuesta IA** | 🧠 | Violeta | Genera respuestas dinamicas usando OpenAI |
| **Webhook** | 🌐 | Naranja | Llama a APIs externas y guarda la respuesta |
| **Espera** | ⏱️ | Gris | Pausa el flujo X segundos (simula escritura) |
| **Transferir** | 👤 | Rosa | Transfiere la conversacion a un agente humano |
| **Fin** | 🏁 | Rojo | Marca el final del flujo |

### Templates Predefinidos (8 disponibles)

| Template | Nodos | Caracteristicas |
|----------|-------|-----------------|
| **Sales Funnel** | 8 | Calificacion de leads con preguntas |
| **Support Funnel** | 6 | FAQ + escalada a humano |
| **Lead Capture** | 5 | Captura nombre, email, telefono |
| **Appointment Booking** | 7 | Agendar citas con validacion |
| **E-Commerce** | 9 | Consulta stock via webhook |
| **Encuesta NPS** | 8 | Encuesta con logica condicional |
| **FAQ Inteligente** | 7 | IA clasifica y responde o escala |
| **Onboarding** | 8 | Bienvenida personalizada con IA |

### Configuracion de Nodos

#### Nodo Trigger

```javascript
{
  type: 'trigger',
  trigger_config: {
    type: 'keyword',           // 'keyword' | 'classification' | 'always'
    keywords: ['hola', 'info'],
    classification: 'sales'     // Para type='classification'
  }
}
```

#### Nodo Pregunta

```javascript
{
  type: 'question',
  content: 'Como te llamas?',
  variable: 'nombre',          // Donde guardar la respuesta
  options: [                   // Opcional: botones de respuesta
    { label: 'Opcion 1', value: 'op1' },
    { label: 'Opcion 2', value: 'op2' }
  ]
}
```

#### Nodo Condicion

```javascript
{
  type: 'condition',
  conditions: [
    { if: 'nps >= 8', goto: 'promoter_node' },
    { if: 'nps <= 4', goto: 'detractor_node' },
    { else: true, goto: 'neutral_node' }
  ]
}
```

#### Nodo Respuesta IA

```javascript
{
  type: 'ai_response',
  system_prompt: 'Eres un asistente de ventas amable...',
  user_prompt: 'El cliente pregunta: {{initial_message}}',
  model: 'gpt-4o-mini',        // 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4-turbo'
  temperature: 0.7,
  max_tokens: 200,
  variable: 'ai_answer'        // Opcional: guardar respuesta
}
```

#### Nodo Webhook

```javascript
{
  type: 'webhook',
  url: 'https://api.ejemplo.com/stock',
  method: 'POST',              // 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers: '{"Authorization": "Bearer {{token}}"}',
  body: '{"product": "{{product_name}}"}',
  timeout: 5000,
  variable: 'api_result'       // Donde guardar la respuesta
}
```

#### Nodo Delay (Espera)

```javascript
{
  type: 'delay',
  seconds: 3,                  // 1-60 segundos
  typing_indicator: true       // Mostrar "escribiendo..."
}
```

#### Nodo Accion

```javascript
{
  type: 'action',
  action: 'save_lead',         // Tipo de accion
  payload: {
    name: '{{nombre}}',
    email: '{{email}}'
  }
}
```

**Acciones disponibles:**
- `notify_sales` - Notifica al equipo de ventas
- `create_ticket` - Crea ticket de soporte
- `save_lead` - Guarda lead en base de datos
- `search_faq` - Busca en FAQ
- `webhook` - Llama API externa
- `send_email` - Envia email (pendiente)

#### Nodo Transfer (Pasar a Humano)

```javascript
{
  type: 'transfer',
  content: 'Te comunico con un agente. Tu caso: {{issue_type}}'
}
```

### Variables Dinamicas

Usa `{{variable}}` para insertar datos dinamicos en cualquier nodo:

- `{{phone}}` - Telefono del usuario
- `{{initial_message}}` - Primer mensaje del usuario
- `{{nombre}}` - Variable capturada en pregunta
- `{{api_result.data}}` - Acceso a objetos anidados

### Simulador de Chat

El Flow Builder incluye un simulador integrado para probar flujos:

- **Modo Local**: Simula la ejecucion sin enviar mensajes reales
- **Modo Servidor**: Ejecuta contra el backend real (requiere guardar el flujo)

---

## APIs del Flow Builder

### Flujos

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/flows` | Listar todos los flujos |
| GET | `/api/flows/:id` | Obtener un flujo |
| POST | `/api/flows` | Crear flujo nuevo |
| PUT | `/api/flows/:id` | Actualizar flujo |
| DELETE | `/api/flows/:id` | Eliminar flujo |
| PUT | `/api/flows/:id/toggle` | Activar/desactivar flujo |

### Templates

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/flows/templates/list` | Listar templates disponibles |
| POST | `/api/flows/templates/:id/create` | Crear flujo desde template |

### Logs de Ejecucion

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/flows/logs` | Listar logs de ejecucion |
| GET | `/api/flows/logs/:id` | Detalle de un log |
| GET | `/api/flows/logs/:id/steps` | Pasos de ejecucion |

### Leads

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/flows/leads` | Listar leads capturados |
| GET | `/api/flows/leads/:id` | Detalle de un lead |
| PUT | `/api/flows/leads/:id` | Actualizar lead |
| DELETE | `/api/flows/leads/:id` | Eliminar lead |
| GET | `/api/flows/leads/export` | Exportar leads (CSV) |

### Analytics

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/flows/analytics/summary` | Resumen general |
| GET | `/api/flows/analytics/flows` | Metricas por flujo |
| GET | `/api/flows/analytics/leads` | Metricas de leads |

---

## Estructura del Frontend (Flow Builder)

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout.jsx           # Layout principal con sidebar
│   │   ├── Sidebar.jsx          # Paleta de nodos arrastrables
│   │   ├── PropertiesPanel.jsx  # Panel de configuracion de nodos
│   │   ├── ChatSimulator.jsx    # Simulador de chat integrado
│   │   └── nodes/               # Componentes de nodos personalizados
│   │
│   ├── pages/
│   │   ├── Dashboard.jsx        # Metricas generales
│   │   ├── Conversations.jsx    # Gestion de conversaciones
│   │   ├── FlowBuilder.jsx      # Editor visual de flujos
│   │   ├── FlowLogs.jsx         # Logs de ejecucion
│   │   ├── Leads.jsx            # Gestion de leads
│   │   └── Analytics.jsx        # Dashboard de analytics
│   │
│   ├── store/
│   │   ├── authStore.js         # Estado de autenticacion
│   │   └── flowStore.js         # Estado del editor de flujos
│   │
│   ├── App.jsx                  # Rutas de la aplicacion
│   └── index.css                # Estilos globales + Tailwind
│
├── public/                      # Assets estaticos
├── vite.config.js               # Configuracion de Vite
└── package.json                 # Dependencias del frontend
```

---

## Motor de Ejecucion de Flujos

El archivo `chatbot/visual-flow-engine.js` contiene la logica de ejecucion:

### Flujo de Ejecucion

```
1. Usuario envia mensaje a WhatsApp
2. Webhook recibe el mensaje
3. VisualFlowEngine.processMessage() busca flujo activo
4. Se evaluan triggers (keyword, classification, always)
5. Si hay match, inicia ejecucion del flujo
6. Ejecuta nodo por nodo segun conexiones
7. Guarda logs y variables en cada paso
8. Termina en nodo 'end' o 'transfer'
```

### Estados de Sesion

```javascript
sessionState = {
  flowId: 'uuid-del-flujo',
  currentNodeId: 'nodo-actual',
  variables: {
    phone: '+56912345678',
    initial_message: 'Hola',
    nombre: 'Juan',
    // ... variables capturadas
  },
  executionLogId: 123
}
```

---

## Licencia

Proyecto privado - Respaldos Chile

---

## Contacto

Para soporte tecnico o consultas sobre el proyecto, contactar al equipo de desarrollo.
