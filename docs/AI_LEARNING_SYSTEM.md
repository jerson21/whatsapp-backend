# Sistema de Aprendizaje IA desde Conversaciones Reales

> **Estado**: Propuesta / Pendiente de implementar
> **Fecha**: 2026-01-29
> **Objetivo**: Que el chatbot aprenda de las respuestas de los agentes humanos para dar mejores respuestas automaticas en el futuro.

---

## Indice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Contexto del Negocio](#contexto-del-negocio)
3. [Contexto Actual](#contexto-actual)
4. [Arquitectura Propuesta](#arquitectura-propuesta)
5. [Fase 1: Recoleccion de Q&A](#fase-1-recoleccion-de-qa)
6. [Fase 2: Recuperacion de Conocimiento](#fase-2-recuperacion-de-conocimiento)
7. [Fase 2.5: Contexto Conversacional (Memoria)](#fase-25-contexto-conversacional-memoria)
8. [Fase 2.6: Tabla de Precios Vigente](#fase-26-tabla-de-precios-vigente)
9. [Fase 3: API de Administracion](#fase-3-api-de-administracion)
10. [Fase 4: Job de Embeddings](#fase-4-job-de-embeddings)
11. [Manejo de Imagenes de Productos](#manejo-de-imagenes-de-productos)
12. [Tono y Personalidad del Bot](#tono-y-personalidad-del-bot)
13. [Comportamiento de Respuesta: Fidelidad, Delay y Mensajes Multiples](#comportamiento-de-respuesta-fidelidad-delay-y-mensajes-multiples)
14. [Configuracion (.env)](#configuracion-env)
15. [Diagrama de Flujo Completo](#diagrama-de-flujo-completo)
16. [Infraestructura Existente que se Reutiliza](#infraestructura-existente-que-se-reutiliza)
17. [Auditoria del Codigo Existente](#auditoria-del-codigo-existente)
18. [Resumen de Archivos](#resumen-de-archivos)
19. [Plan de Verificacion](#plan-de-verificacion)
20. [Consideraciones y Riesgos](#consideraciones-y-riesgos)

---

## Resumen Ejecutivo

**Problema**: El chatbot actual (Visual Flow Engine) funciona con **reglas fijas** (flujos visuales: "si dice X, responde Y"). Cuando no hay un flujo configurado, cae a un fallback generico que no sabe nada del negocio. Ademas, no tiene memoria de la conversacion — cada mensaje se trata como si fuera el primero.

**Solucion**: Convertir el fallback en un bot **generativo con contexto**:
1. **Extrae** pares pregunta/respuesta de conversaciones que los agentes humanos manejan
2. **Puntua** la calidad de cada par
3. **Genera embeddings** (vectores numericos) de las preguntas
4. **Inyecta** las respuestas relevantes + el historial de la conversacion actual como contexto cuando el chatbot responde

**Que significa "generativo"**: En vez de responder con textos fijos predefinidos (reglas), el bot usa GPT-4o-mini para generar respuestas naturales basadas en informacion real. Los flujos visuales (reglas) siguen funcionando para lo que ya esta configurado. Lo generativo solo entra cuando no hay flujo — pero ahora con conocimiento real del negocio y memoria de lo que el cliente ya pregunto.

**Resultado**: El chatbot responde con informacion real que los agentes ya validaron, mantiene el hilo de la conversacion, y suena como un vendedor, no como un robot.

**Tecnologias**: OpenAI Embeddings (`text-embedding-3-small`), OpenAI Vision (GPT-4o), busqueda vectorial (similitud coseno), BM25 (busqueda por keywords), MySQL.

**Nota sobre adaptabilidad**: El sistema es generico — aprende del negocio en el que se usa. Para Respaldos Chile aprende sobre camas, respaldos de cama, muebles, medidas, plazos de fabricacion, etc. Si el software se vende a otro negocio, aprende del rubro de ese cliente automaticamente.

---

## Contexto del Negocio

**Respaldos Chile** vende camas, respaldos de cama y muebles. No es un servicio de backup de datos.

### Preguntas tipicas de los clientes
- "Cuanto vale el respaldo capitone en king?"
- "Tienen en plaza y media?"
- "Tienen en 1.5?( 1.5 tambien es plaza y media).
- "Cuanto se demoran en fabricar?"
- "Me pueden enviar a regiones?"
- [Envia foto de un respaldo] "Tienen algo parecido a esto?"
- "Que colores tienen disponibles?"
- "Lo puedo pagar en cuotas?"

### Informacion que los agentes manejan
- Precios por modelo y medida (1 plaza, plaza y media, 2 plazas, Full, queen, king, super king)
- Materiales (Felpa,lino,tela, ecocuero, madera, etc.)
- Plazos de fabricacion (3 a 7 dias habiles tipicamente)
- Despacho (Santiago vs regiones, costos)
- A regiones enviamos por agencias de transporte con envio por pagar. el producto debe pagarse antes de realizar su fabricacion y envio.
- Opciones de pago (transferencia, tarjeta, cuotas)
- Colores y personalizacion

---

## Contexto Actual

### Como funciona hoy el chatbot

```
Cliente envia mensaje
        |
        v
Visual Flow Engine (visual-flow-engine.js)
        |
        +---> Busca flujo visual por keyword/intent
        |
        +---> Si encuentra --> Ejecuta nodos del flujo
        |
        +---> Si NO encuentra --> handleAIFallback()
                    |
                    v
              OpenAI GPT-4o-mini
              (system prompt generico, sin contexto real)
                    |
                    v
              Respuesta generica:
              "Puedo ayudarte, escribe 'agente' para hablar con alguien"
```

### Archivos clave actuales

| Archivo | Que hace | Estado (auditoria) |
|---------|----------|---------------------|
| `chatbot/visual-flow-engine.js` | Motor de flujos visuales. Tiene `handleAIFallback()` que llama a OpenAI cuando no hay flujo | **MODIFICAR** — AI fallback sin contexto |
| `chatbot/chatbot.js` | Orquestador del chatbot (version limpia). Delega a VisualFlowEngine | **OK** — No necesita cambios |
| `chatbot/message-classifier.js` | Clasifica intenciones, urgencia, sentimiento | Funcional, sentiment basico |
| `faq/faq-store.js` | ~~Cache en memoria de FAQs con busqueda BM25~~ | **CODIGO MUERTO** — No se usa, eliminar |
| `faq/faq-database.js` | CRUD de FAQs en MySQL + busqueda BM25 en memoria | **REFACTORIZAR** — BM25 debil |
| `app-cloud.js` | Servidor principal. Maneja webhook, sesiones, mensajes | FAQ y RAG desconectados del chatbot |

### System prompt actual (visual-flow-engine.js:204-217)

```
Eres un asistente virtual amable y profesional de Respaldos Chile.
Tu rol es ayudar a los clientes con consultas generales.

REGLAS:
- Responde de forma concisa (maximo 3 lineas)
- Se amable pero profesional
- Si no puedes ayudar con algo especifico, sugiere escribir "agente"
- Puedes sugerir escribir "menu" para ver las opciones disponibles

NUNCA:
- Inventes informacion sobre productos o precios
- Prometas cosas que no puedes cumplir
- Des informacion tecnica detallada (sugiere hablar con un agente)
```

**Problema**: Le dice "NUNCA inventes informacion" pero no le da informacion real. Resultado: el chatbot no puede dar precios, detalles, ni nada util.

### Tablas de BD existentes que se reutilizan

```sql
-- Ya existe: almacena chunks con embeddings
CREATE TABLE kb_chunks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  intent VARCHAR(128),
  tags JSON,
  chunk_index INT DEFAULT 0,
  content MEDIUMTEXT NOT NULL,
  embedding JSON NULL,          -- <-- vector de embedding
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Ya existe: FAQs con busqueda BM25
CREATE TABLE faq_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tags JSON,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Variables .env existentes (ya configuradas)

```env
OPENAI_API_KEY=...                              # API key de OpenAI
OPENAI_EMBEDDINGS_MODEL=text-embedding-3-small  # Modelo de embeddings
RAG_ENABLED=true                                # Flag para RAG (no conectado aun)
```

---

## Arquitectura Propuesta

```
                    RECOLECCION (Fase 1)
                    ====================

Agente humano resuelve conversacion
            |
            v
conversation-learner.js
  - Lee mensajes de la sesion
  - Extrae pares pregunta -> respuesta
  - Calcula quality_score (0-100)
  - Guarda en tabla learned_qa_pairs
            |
            v
    +-------------------+
    | learned_qa_pairs   |
    | - question         |
    | - answer           |
    | - quality_score    |
    | - status: pending  |
    | - embedding: null  |
    +-------------------+


                    APROBACION (Manual o Auto)
                    ==========================

Supervisor revisa en panel admin (API REST)
  - Aprueba pares buenos   --> status = 'approved'
  - Rechaza pares malos    --> status = 'rejected'
  - (Opcional) Auto-approve si score >= 80


                    EMBEDDINGS (Fase 4)
                    ====================

Job cada 5 minutos:
  - Busca pares approved sin embedding
  - Genera embedding de la pregunta con text-embedding-3-small
  - Guarda vector en columna embedding (JSON)

    +-------------------+
    | learned_qa_pairs   |
    | - status: approved |
    | - embedding: [...]  |  <-- vector de 1536 dimensiones
    +-------------------+


                    RECUPERACION (Fase 2)
                    =====================

Cliente envia mensaje nuevo
            |
            v
knowledge-retriever.js
  - Genera embedding del mensaje
  - Busca en learned_qa_pairs por similitud coseno (top 3)
  - Busca en faq_entries por keywords BM25 (top 2)
  - Combina y filtra resultados
            |
            v
visual-flow-engine.js (handleAIFallback)
  - Recibe contexto del retriever
  - Lo inyecta en el system prompt de OpenAI
  - GPT-4o-mini responde CON informacion real
            |
            v
    Respuesta informada:
    "El capitone en king te queda a $189.990, va en ecocuero
     y lo fabricamos en unos 10 dias. Te interesa en algun
     color en particular?"
```

---

## Fase 1: Recoleccion de Q&A

### Archivo nuevo: `chatbot/conversation-learner.js`

**Que hace**: Cuando un agente humano marca una conversacion como "resuelta", este modulo lee todos los mensajes y extrae pares pregunta/respuesta utiles.

### Tabla nueva: `learned_qa_pairs`

```sql
CREATE TABLE IF NOT EXISTS learned_qa_pairs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,          -- referencia a chat_sessions.id
  question TEXT NOT NULL,            -- pregunta del cliente
  answer TEXT NOT NULL,              -- respuesta del agente humano
  quality_score INT DEFAULT 0,       -- puntuacion 0-100
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  embedding JSON NULL,               -- vector de embedding (1536 dimensiones)
  agent_id INT NULL,                 -- quien respondio
  channel VARCHAR(20) DEFAULT 'whatsapp',  -- whatsapp/instagram
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_quality (quality_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Logica de extraccion

```
Mensajes de una sesion tipica:

  [IN]  "hola buenas tardes"
  [OUT] "Hola! Bienvenido a Respaldos Chile, en que te puedo ayudar?"   (agente)
  [IN]  "cuanto vale el respaldo capitone en king?"
  [OUT] "El capitone en king esta a $189.990, va en ecocuero y          (agente)  <-- ESTE PAR
         lo fabricamos en 10 dias habiles aprox"
  [IN]  "y en queen?"
  [OUT] "En queen queda a $159.990, mismo modelo y plazo"               (agente)  <-- ESTE PAR
  [IN]  "ya me interesa el king, como pago?"
  [OUT] "Puedes pagar por transferencia o tarjeta hasta en              (agente)  <-- ESTE PAR
         6 cuotas sin interes. Te mando los datos?"

Pares extraidos:
  1. Q: "cuanto vale el respaldo capitone en king?"
     A: "El capitone en king esta a $189.990, va en ecocuero y lo fabricamos en 10 dias habiles aprox"
     Score: 95 (respuesta larga + precio + medida + plazo fabricacion + conversacion resuelta)

  2. Q: "y en queen?"
     A: "En queen queda a $159.990, mismo modelo y plazo"
     Score: 75 (precio + medida + compara modelos + conversacion resuelta)

  3. Q: "ya me interesa el king, como pago?"
     A: "Puedes pagar por transferencia o tarjeta hasta en 6 cuotas sin interes. Te mando los datos?"
     Score: 80 (respuesta larga + info especifica + conversacion resuelta)
```

### Algoritmo de extraccion (pseudocodigo)

```javascript
async extractFromSession(sessionId) {
  // 1. Obtener todos los mensajes de la sesion
  const messages = await db.query(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
    [sessionId]
  );

  // 2. Obtener info de la sesion
  const session = await db.query(
    'SELECT * FROM chat_sessions WHERE id = ?',
    [sessionId]
  );

  const pairs = [];

  // 3. Para cada mensaje saliente de agente humano...
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Solo mensajes de agentes humanos (no del bot)
    if (msg.direction !== 'outgoing' || msg.is_ai_generated) continue;

    // Buscar la pregunta previa mas cercana
    let question = null;
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].direction === 'incoming') {
        question = messages[j].text;
        break;
      }
    }

    if (!question || !msg.text) continue;

    // Descartar pares triviales
    if (question.length < 10 || msg.text.length < 10) continue;
    if (isTrivialGreeting(question)) continue;

    // Calcular quality score
    const score = calculateQualityScore({
      question,
      answer: msg.text,
      session,
      agentId: msg.agent_id,
      // Verificar si el cliente respondio positivamente despues
      nextClientMessage: messages[i + 1]?.direction === 'incoming' ? messages[i + 1].text : null
    });

    pairs.push({ question, answer: msg.text, score, agentId: msg.agent_id });
  }

  // 4. Guardar en BD
  for (const pair of pairs) {
    await db.query(
      'INSERT INTO learned_qa_pairs (session_id, question, answer, quality_score, agent_id, channel) VALUES (?,?,?,?,?,?)',
      [sessionId, pair.question, pair.answer, pair.score, pair.agentId, session.channel || 'whatsapp']
    );
  }
}
```

### Puntuacion de calidad (0-100)

**Criterios base (generico — aplica a cualquier negocio):**

| Criterio | Puntos | Logica |
|----------|--------|--------|
| Respuesta larga (> 50 chars) | +20 | Respuestas sustanciales, no solo "ok" |
| Info especifica (precios, fechas, URLs) | +15 | Regex: `\$`, `CLP`, fechas, dominios |
| Cliente respondio positivamente | +15 | Siguiente mensaje: "ok", "gracias", "perfecto" |
| Agente es supervisor | +10 | Supervisores suelen dar respuestas mas completas |
| Conversacion resuelta (no escalada) | +10 | `escalation_status != 'ESCALATED'` |

**Criterios de rubro (detectados automaticamente en el texto):**

| Criterio | Puntos | Logica |
|----------|--------|--------|
| Menciona medida (cm, plaza, king, queen, 1.5, 2 plazas) | +10 | Regex: `plaza|king|queen|\\d+\\s*cm|\\d+x\\d+` |
| Compara modelos o medidas | +10 | Respuesta menciona 2+ precios o 2+ medidas |
| Recomienda activamente | +10 | Regex: `te recomiendo|te sugiero|la mejor opcion|ideal para` |
| Incluye plazo de fabricacion | +10 | Regex: `dias habiles|semanas|plazo|fabricamos en|demora` |

**Maximo total**: 100 puntos (20+15+15+10+10+10+10+10+10 = 110, capped a 100)

**Umbral minimo**: Solo se usan pares con `quality_score >= 50`.

**Nota**: Los criterios de rubro se detectan por regex sobre el texto de la respuesta. No son hardcodeados para "camas" — si el negocio vende zapatos y el agente responde con tallas y precios, los regex de medidas y precios igual matchean. El sistema se adapta solo.

### Donde se dispara

En `app-cloud.js`, cuando una conversacion cambia a status `resolved`:

```javascript
// Punto de integracion en app-cloud.js
// Cuando el agente marca como "resuelta" la conversacion:

if (newStatus === 'resolved' && process.env.LEARNING_ENABLED === 'true') {
  // Ejecutar en background (no bloquea la respuesta HTTP)
  conversationLearner.extractFromSession(sessionId).catch(err => {
    logger.error({ err, sessionId }, 'Error extracting Q&A pairs');
  });
}
```

---

## Fase 2: Recuperacion de Conocimiento

### Archivo nuevo: `chatbot/knowledge-retriever.js`

**Que hace**: Cuando el chatbot necesita responder (en `handleAIFallback`), este modulo busca respuestas similares que los agentes ya dieron antes.

### Busqueda hibrida: Vectorial + Keywords

```
Mensaje del cliente: "cuanto sale el respaldo mensual?"
                            |
           +----------------+----------------+
           |                                 |
           v                                 v
    BUSQUEDA VECTORIAL                 BUSQUEDA BM25
    (learned_qa_pairs)                 (faq_entries)
           |                                 |
    1. Generar embedding                1. Tokenizar mensaje
       del mensaje                      2. Calcular scores BM25
    2. Comparar con embeddings          3. Top 2 resultados
       almacenados (coseno)
    3. Top 3 (threshold > 0.75)
           |                                 |
           +----------------+----------------+
                            |
                            v
                    COMBINAR Y ORDENAR
                    (por relevancia)
                            |
                            v
                    CONTEXTO FORMATEADO
```

### Que es un embedding?

Un embedding es un vector numerico (lista de 1536 numeros) que representa el "significado" de un texto. Textos con significado similar tienen vectores cercanos.

```
"cuanto cuesta el respaldo?"     --> [0.12, -0.34, 0.56, ...]  (1536 numeros)
"que precio tiene el backup?"    --> [0.11, -0.33, 0.55, ...]  (muy similar!)
"hola como estas"                --> [0.89, 0.22, -0.67, ...]  (muy diferente)
```

La **similitud coseno** mide que tan parecidos son dos vectores (0 = nada parecido, 1 = identico). Usamos threshold > 0.75 para asegurar relevancia.

### Que es BM25?

BM25 es un algoritmo de busqueda por keywords (como Google). Funciona bien para coincidencias exactas de palabras. Lo usamos como complemento a la busqueda vectorial.

Ya existe implementado en `faq/faq-store.js` con el metodo `search(query)`.

### Como se inyecta en el chatbot

En `chatbot/visual-flow-engine.js`, metodo `handleAIFallback()`:

```javascript
// ANTES (actual):
const systemPrompt = `Eres un asistente virtual amable y profesional de Respaldos Chile...`;

// DESPUES (propuesto):
const context = await knowledgeRetriever.retrieve(userMessage);
const recentContext = await getRecentContext(sessionId, 30); // 30 msgs crudos → ~10-15 turnos
const prices = isPriceQuery(userMessage) ? await findPrice(detectedProduct, detectedVariant) : [];

const systemPrompt = `Eres un vendedor amable de Respaldos Chile que conversa por WhatsApp/Instagram...

${context ? `
--- CONOCIMIENTO DEL EQUIPO ---
Estas son respuestas que tu equipo humano ha dado a preguntas similares.
Usa esta informacion para responder de forma precisa:

${context.map(c => `Pregunta: "${c.question}"
Respuesta del equipo: "${c.answer}"
`).join('\n')}
--- FIN CONOCIMIENTO ---
` : ''}

${prices.length > 0 ? `
--- PRECIOS VIGENTES ---
${prices.map(p => `${p.product_name} ${p.variant}: $${p.price.toLocaleString('es-CL')}`).join('\n')}
IMPORTANTE: Usa SOLO estos precios. Los precios en las respuestas del equipo pueden estar desactualizados.
--- FIN PRECIOS ---
` : ''}`;

// El historial va en el array de messages, NO en el system prompt
const messages = [
  { role: 'system', content: systemPrompt },
  // Historial agrupado (turnos reales de conversacion)
  ...recentContext.map(m => ({
    role: m.direction === 'incoming' ? 'user' : 'assistant',
    content: m.text
  })),
  // Mensaje actual del cliente
  { role: 'user', content: userMessage }
];
```

**Resultado**: GPT-4o-mini recibe conocimiento del negocio + historial de la conversacion actual, y genera respuestas naturales e informadas.

### Ejemplo practico: Sin contexto vs Con contexto

```
Cliente: "cuanto vale el respaldo capitone?"

SIN aprendizaje (hoy):
  Bot: "Te puedo ayudar con eso. Escribe 'agente' para hablar con alguien
        de nuestro equipo que te pueda dar informacion detallada."

CON aprendizaje (propuesto):
  Bot: "El capitone parte en $129.990 en plaza y media y $189.990 en king.
        Va en ecocuero y lo fabricamos en unos 10 dias habiles.
        Quieres que te cotice en alguna medida especifica?"
```

### Ejemplo practico: Sin memoria vs Con memoria

```
SIN memoria de conversacion (hoy):
  Cliente: "cuanto vale el capitone en king?"
  Bot: "El capitone en king esta a $189.990"
  Cliente: "y en queen?"
  Bot: "No entiendo tu consulta. Escribe 'agente' para hablar con alguien."
  ❌ El bot no sabe que "en queen" se refiere al capitone

CON memoria de conversacion (propuesto):
  Cliente: "cuanto vale el capitone en king?"
  Bot: "El capitone en king esta a $189.990"
  Cliente: "y en queen?"
  Bot: "En queen el capitone queda a $159.990, mismo diseño y plazo."
  ✅ El bot sabe que se habla del capitone porque tiene el historial
```

El bot responde como un vendedor que sabe del producto Y recuerda lo que ya se habló.

---

## Fase 2.5: Contexto Conversacional (Memoria)

### El problema

Sin memoria, cada mensaje se trata como independiente. El bot no sabe:
- Que producto se está cotizando
- Si ya dio un precio y el cliente quiere otra medida
- Si el cliente dijo su nombre o su comuna
- Si ya se ofreció algo y el cliente quiere comparar

### Solucion: Contexto inteligente con agrupacion de mensajes

El problema de WhatsApp es que la gente escribe asi:

```
[IN] "hola"
[IN] "como"
[IN] "estas"
[IN] "quiero ver"
[IN] "respaldos"
[IN] "capitone"
```

Esos 6 mensajes son **una sola idea**: "hola como estas, quiero ver respaldos capitone". Si cargamos solo los ultimos 10 mensajes "crudos", perdemos contexto rapido porque la mitad son fragmentos cortos.

### Estrategia: Agrupar + Cargar mas

En vez de cargar N mensajes crudos, hacemos dos cosas:

1. **Cargar mas mensajes crudos** (30 por defecto) para tener mas margen
2. **Agrupar mensajes consecutivos** del mismo remitente en un solo bloque

```javascript
async function getRecentContext(sessionId, rawLimit = 30) {
  // 1. Cargar los ultimos 30 mensajes crudos
  const [rows] = await pool.query(
    `SELECT direction, text, created_at FROM chat_messages
     WHERE session_id = ? AND text IS NOT NULL AND text != ''
     ORDER BY created_at DESC LIMIT ?`,
    [sessionId, rawLimit]
  );

  const messages = rows.reverse(); // mas antiguo primero

  // 2. Agrupar mensajes consecutivos del mismo remitente
  const grouped = [];
  let current = null;

  for (const msg of messages) {
    if (current && current.direction === msg.direction) {
      // Mismo remitente consecutivo → concatenar con salto de linea
      current.text += '\n' + msg.text;
    } else {
      // Nuevo remitente → crear nuevo bloque
      if (current) grouped.push(current);
      current = { direction: msg.direction, text: msg.text };
    }
  }
  if (current) grouped.push(current);

  // 3. Retornar los bloques agrupados (ya son "turnos" de conversacion)
  return grouped;
}
```

### Ejemplo de agrupacion

```
ANTES (30 mensajes crudos):
  [IN]  "hola"
  [IN]  "como estas"
  [IN]  "quiero ver respaldos"
  [OUT] "Hola! Bienvenido a Respaldos Chile"
  [OUT] "En que te puedo ayudar?"
  [IN]  "el capitone"
  [IN]  "en king"
  [IN]  "cuanto sale?"
  [OUT] "El capitone en king te queda a $189.990, va en ecocuero"
  [IN]  "y en queen?"

DESPUES (5 turnos agrupados):
  [IN]  "hola\ncomo estas\nquiero ver respaldos"
  [OUT] "Hola! Bienvenido a Respaldos Chile\nEn que te puedo ayudar?"
  [IN]  "el capitone\nen king\ncuanto sale?"
  [OUT] "El capitone en king te queda a $189.990, va en ecocuero"
  [IN]  "y en queen?"
```

10 mensajes crudos se convirtieron en 5 turnos. Con 30 mensajes crudos se pueden tener 10-15 turnos reales de conversacion, que cubren mucho mas contexto.

### Como se pasa a GPT

GPT espera un array de mensajes con roles `system`, `user`, `assistant`:

```javascript
const grouped = await getRecentContext(sessionId, 30);

const messages = [
  // 1. System prompt (instrucciones + conocimiento aprendido + precios)
  { role: 'system', content: systemPrompt },

  // 2. Historial agrupado (turnos reales de conversacion)
  ...grouped.map(m => ({
    role: m.direction === 'incoming' ? 'user' : 'assistant',
    content: m.text
  })),

  // 3. Mensaje actual
  { role: 'user', content: userMessage }
];
```

GPT lee todo el historial y entiende el contexto. No necesita que el cliente repita "capitone" — ya sabe de que hablan.

### Por que 30 mensajes crudos?

En una conversacion de venta de muebles, un cliente puede:
- Preguntar por 3-4 productos diferentes
- Pedir medidas, colores, fotos
- Comparar opciones
- Volver a un producto anterior ("al final me quedo con el primero")

Con 30 mensajes crudos (~10-15 turnos agrupados) se cubre una conversacion de venta completa tipica.

| Mensajes crudos | Turnos agrupados aprox | Cubre |
|-----------------|----------------------|-------|
| 10 | 4-5 | Solo las ultimas preguntas |
| **30** | **10-15** | **Conversacion de venta completa** |
| 50 | 15-25 | Conversacion larga con muchas opciones |
| Todos | Todos | Historico completo (riesgo de exceder tokens) |

**Default**: 30 mensajes crudos. Configurable via `LEARNING_CONTEXT_MESSAGES=30`.

### Costo adicional

Los mensajes del historial cuentan como tokens de input para GPT-4o-mini:
- 30 mensajes cortos agrupados = ~400-800 tokens extra
- GPT-4o-mini input: $0.15 / millon tokens
- 100 conversaciones/dia con 30 msgs c/u = ~80,000 tokens = ~$0.012/dia
- Costo despreciable (menos de $0.40/mes)

### Que NO se incluye en el historial

- Mensajes de sistema internos (notificaciones, asignaciones)
- Mensajes vacios o solo con media sin texto
- Mensajes muy antiguos (solo los ultimos N crudos)

---

## Fase 2.6: Tabla de Precios Vigente

### Principio clave: Separar CONOCIMIENTO de PRECIOS

El sistema de aprendizaje enseña al bot **como vender**: tono, estilo, recomendaciones, comparaciones, respuestas a objeciones. Pero los **precios** no deben venir de los Q&A aprendidos — vienen de una **tabla de precios vigente** mantenida por el negocio.

```
¿Por que?
- Los precios cambian (promociones, ajustes, temporada)
- Un Q&A de hace 3 meses puede tener un precio desactualizado
- El equipo debe poder actualizar precios sin re-entrenar nada
- Un precio mal aprendido puede generar problemas con clientes
```

### Como funciona

```
Cliente: "cuanto vale el capitone en king?"
                    |
                    v
    ┌───────────────────────────────┐
    │ knowledge-retriever.js        │
    │                               │
    │ 1. Busca Q&A similares        │  --> "Como vendemos el capitone:
    │    (tono, estilo, como        │       ecocuero, facil de limpiar,
    │     recomendar)               │       fabricacion 10 dias..."
    │                               │
    │ 2. Busca en product_prices    │  --> precio vigente: $189.990
    │    por producto + medida      │
    └───────────────┬───────────────┘
                    |
                    v
    GPT recibe:
    - Contexto de COMO vender (del aprendizaje)
    - Precio ACTUAL (de la tabla de precios)
    - Historial de la conversacion (memoria)
                    |
                    v
    Bot: "El capitone en king te queda a $189.990, va en ecocuero
          que es super facil de limpiar. Lo fabricamos en unos 10
          dias. Te interesa en algun color en particular?"
```

### Tabla nueva: `product_prices`

```sql
CREATE TABLE IF NOT EXISTS product_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(255) NOT NULL,      -- "Respaldo Capitone"
  variant VARCHAR(255) NULL,                -- "King", "Queen", "Plaza y media"
  price DECIMAL(10,2) NOT NULL,             -- 189990.00
  currency VARCHAR(10) DEFAULT 'CLP',
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT NULL,                           -- "ecocuero, todos los colores"
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product (product_name),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Ejemplo de datos

```sql
INSERT INTO product_prices (product_name, variant, price, notes) VALUES
('Respaldo Capitone', '1 Plaza', 99990, 'ecocuero, todos los colores'),
('Respaldo Capitone', 'Plaza y media', 129990, 'ecocuero, todos los colores'),
('Respaldo Capitone', '2 Plazas', 149990, 'ecocuero, todos los colores'),
('Respaldo Capitone', 'Full', 159990, 'ecocuero, todos los colores'),
('Respaldo Capitone', 'Queen', 169990, 'ecocuero, todos los colores'),
('Respaldo Capitone', 'King', 189990, 'ecocuero, todos los colores'),
('Respaldo Capitone', 'Super King', 209990, 'ecocuero, todos los colores');
```

### Como se consulta la tabla de precios

```javascript
// En knowledge-retriever.js
async function findPrice(productName, variant) {
  const [rows] = await pool.query(
    `SELECT product_name, variant, price, notes
     FROM product_prices
     WHERE is_active = TRUE
       AND (product_name LIKE ? OR product_name LIKE ?)
     ORDER BY
       CASE WHEN variant LIKE ? THEN 0 ELSE 1 END,
       price ASC
     LIMIT 5`,
    [`%${productName}%`, `%${variant}%`, `%${variant}%`]
  );
  return rows;
}
```

### Como se inyecta en el prompt

```javascript
// System prompt incluye precios vigentes cuando se detecta consulta de precio
const priceContext = prices.length > 0 ? `
--- PRECIOS VIGENTES ---
${prices.map(p => `${p.product_name} ${p.variant}: $${p.price.toLocaleString('es-CL')}${p.notes ? ` (${p.notes})` : ''}`).join('\n')}
--- FIN PRECIOS ---

IMPORTANTE: Usa SOLO estos precios. NO uses precios de las respuestas del equipo
porque pueden estar desactualizados.
` : '';
```

### Deteccion de consulta de precio

```javascript
function isPriceQuery(text) {
  const patterns = [
    /cu[aá]nto\s*(vale|cuesta|sale|est[aá])/i,
    /precio/i,
    /valor/i,
    /\$\s*\d/,
    /cotiz/i,
    /cuotas/i
  ];
  return patterns.some(p => p.test(text));
}
```

### Que pasa cuando NO hay precio en la tabla?

Si el producto no esta en `product_prices`, el bot **no inventa un precio**. En vez de eso:
- Usa el conocimiento aprendido para describir el producto (material, estilo, etc.)
- Dice algo como: "Dejame confirmar el precio actualizado y te respondo altiro"
- Opcionalmente: notifica al agente para que complete la tabla de precios

### API para gestionar precios

Se agregan endpoints al panel de admin:

| Metodo | Ruta | Que hace |
|--------|------|----------|
| `GET` | `/api/learning/prices` | Listar precios vigentes |
| `POST` | `/api/learning/prices` | Agregar precio |
| `PUT` | `/api/learning/prices/:id` | Actualizar precio |
| `DELETE` | `/api/learning/prices/:id` | Desactivar precio |

### Resumen: Que viene de donde

| Informacion | Fuente | Ejemplo |
|-------------|--------|---------|
| Precio | `product_prices` (tabla mantenida) | "$189.990" |
| Como vender | `learned_qa_pairs` (aprendizaje) | "va en ecocuero que es super facil de limpiar" |
| Material/estilo | `learned_qa_pairs` (aprendizaje) | "Lo fabricamos en el color que prefieras" |
| Plazo fabricacion | `learned_qa_pairs` (aprendizaje) | "en unos 10 dias habiles" |
| Despacho | `learned_qa_pairs` (aprendizaje) | "A Santiago sale $5.990" |
| Contexto conversacion | `chat_messages` (historial) | Sabe que el cliente ya pregunto por king |

---

## Fase 3: API de Administracion

### Archivo nuevo: `api/learning-routes.js`

Endpoints REST para que el supervisor pueda revisar y gestionar los pares aprendidos desde el panel de administracion.

### Endpoints

| Metodo | Ruta | Que hace | Ejemplo |
|--------|------|----------|---------|
| `GET` | `/api/learning/pairs` | Listar pares (paginado) | `?page=1&limit=20&status=pending` |
| `PATCH` | `/api/learning/pairs/:id` | Aprobar o rechazar | `{ "status": "approved" }` |
| `DELETE` | `/api/learning/pairs/:id` | Eliminar par | - |
| `POST` | `/api/learning/reprocess` | Re-procesar conversaciones pasadas | `{ "from": "2026-01-01" }` |
| `GET` | `/api/learning/stats` | Estadisticas | - |

### Ejemplo de respuesta GET /api/learning/pairs

```json
{
  "ok": true,
  "pairs": [
    {
      "id": 42,
      "session_id": 156,
      "question": "cuanto vale el respaldo capitone en king?",
      "answer": "El capitone en king te queda a $189.990, va en ecocuero...",
      "quality_score": 85,
      "status": "pending",
      "agent_id": 3,
      "channel": "whatsapp",
      "created_at": "2026-01-29T15:30:00Z"
    }
  ],
  "total": 127,
  "page": 1,
  "pages": 7
}
```

### Ejemplo de respuesta GET /api/learning/stats

```json
{
  "ok": true,
  "stats": {
    "total": 127,
    "pending": 45,
    "approved": 72,
    "rejected": 10,
    "with_embedding": 68,
    "avg_quality": 67.3,
    "by_channel": {
      "whatsapp": 98,
      "instagram": 29
    }
  }
}
```

### Montaje en app-cloud.js

```javascript
const learningRoutes = require('./api/learning-routes');
app.use('/api/learning', learningRoutes);
```

---

## Fase 4: Job de Embeddings

### Dentro de `conversation-learner.js`

Funcion que se ejecuta cada 5 minutos para generar embeddings de los pares aprobados.

```javascript
async function generateEmbeddings() {
  // 1. Buscar pares aprobados sin embedding
  const [pairs] = await pool.query(
    `SELECT id, question FROM learned_qa_pairs
     WHERE status = 'approved' AND embedding IS NULL
     LIMIT 20`
  );

  if (!pairs.length) return;

  // 2. Generar embeddings en batch
  const texts = pairs.map(p => p.question);
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',  // 1536 dimensiones, barato
    input: texts
  });

  // 3. Guardar en BD
  for (let i = 0; i < pairs.length; i++) {
    const vector = response.data[i].embedding;  // array de 1536 floats
    await pool.query(
      'UPDATE learned_qa_pairs SET embedding = ? WHERE id = ?',
      [JSON.stringify(vector), pairs[i].id]
    );
  }
}
```

### Activacion en app-cloud.js

```javascript
// Ejecutar cada 5 minutos
if (process.env.LEARNING_ENABLED === 'true') {
  setInterval(() => {
    conversationLearner.generateEmbeddings().catch(err => {
      logger.error({ err }, 'Error generating embeddings');
    });
  }, 5 * 60 * 1000);
}
```

### Costo de OpenAI Embeddings

`text-embedding-3-small` es muy barato:
- ~$0.02 por millon de tokens
- Una pregunta tipica tiene ~20 tokens
- 1000 preguntas = 20,000 tokens = ~$0.0004 (menos de 1 centavo USD)

---

## Manejo de Imagenes de Productos

### El problema

Muchos clientes envian una foto de un respaldo (de Pinterest, Instagram, otra tienda) y preguntan:
- "Tienen algo parecido a esto?"
- "Cuanto vale este?"
- "Me lo pueden hacer igual?"

Hoy el bot ignora la imagen completamente. Solo lee el texto.

### Solucion: Vision AI (GPT-4o)

Cuando el cliente envia una imagen con texto que sugiere una consulta de producto, usamos GPT-4o (que entiende imagenes) para:

1. **Describir** la imagen: "Respaldo capitone en tela gris, estilo moderno, king size"
2. **Buscar** en los Q&A aprendidos usando esa descripcion como query
3. **Responder** con productos similares y precios

### Flujo de imagen

```
Cliente envia: [FOTO] + "cuanto vale este?"
                    |
                    v
          ¿Tiene imagen adjunta?
          ¿El texto sugiere consulta de producto?
                    |
                    SI
                    |
                    v
          GPT-4o Vision: Describir imagen
          "Respaldo capitone tapizado en tela gris,
           estilo moderno, aparenta medida king"
                    |
                    v
          knowledge-retriever.js
          Buscar con: descripcion + texto del cliente
                    |
                    v
          GPT-4o-mini: Generar respuesta
          con contexto de productos similares
                    |
                    v
          Bot: "Se parece a nuestro modelo Capitone Premium!
                En king esta a $189.990 y lo fabricamos en
                el color que prefieras. Te interesa?"
```

### Pseudocodigo del handler de imagen

```javascript
async function handleImageQuery(imageUrl, userText, phone) {
  // 1. Describir la imagen con GPT-4o Vision
  const description = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: imageUrl, detail: 'low' }  // 'low' = mas barato
        },
        {
          type: 'text',
          text: 'Describe este mueble/respaldo de cama en una linea. Incluye: tipo, material aparente, color, estilo, medida estimada.'
        }
      ]
    }],
    max_tokens: 100
  });

  const imageDescription = description.choices[0].message.content;
  // Ej: "Respaldo capitone en ecocuero blanco, estilo moderno, medida king aprox"

  // 2. Buscar Q&A similares usando la descripcion
  const searchQuery = `${imageDescription} ${userText}`;
  const context = await knowledgeRetriever.retrieve(searchQuery);

  // 3. Responder con contexto
  // (se inyecta en handleAIFallback como siempre)
  return context;
}
```

### Cuando NO usar Vision

- Si el mensaje no tiene imagen → flujo normal
- Si el texto no sugiere consulta de producto ("jaja mira esto", "gracias") → ignorar imagen
- Si no hay pares aprendidos relevantes → decir "Dejame revisar con el equipo, te respondo pronto"

### Deteccion de consulta de producto con imagen

```javascript
function isProductImageQuery(text) {
  if (!text) return false;
  const patterns = [
    /cu[aá]nto\s*(vale|cuesta|sale)/i,
    /tienen\s*(algo|uno)\s*(parecido|similar|igual|asi)/i,
    /me\s*lo\s*pueden\s*hacer/i,
    /este\s*modelo/i,
    /precio/i,
    /hacen\s*(algo|uno)\s*asi/i,
    /lo\s*tienen/i,
    /que\s*precio/i
  ];
  return patterns.some(p => p.test(text));
}
```

### Costo de GPT-4o Vision

- Modo `detail: 'low'` = costo fijo por imagen (~$0.003 por imagen)
- Mucho mas barato que `detail: 'high'` ($0.03+)
- Con 20 consultas de imagen/dia = ~$0.06/dia = ~$1.80/mes
- Para el uso esperado es muy razonable

### Almacenamiento de pares con imagen

Cuando un agente responde a una consulta con imagen, el par se guarda con la descripcion de la imagen:

```sql
-- El question del par incluye la descripcion generada por Vision
INSERT INTO learned_qa_pairs (session_id, question, answer, quality_score, ...)
VALUES (
  123,
  '[IMAGEN: Respaldo capitone ecocuero blanco, king] cuanto vale este?',
  'Ese modelo es similar a nuestro Capitone Premium, en king queda a $189.990...',
  90,
  ...
);
```

Asi cuando otro cliente envia una foto similar, la busqueda vectorial encuentra este par porque la descripcion de la imagen es semanticamente similar.

---

## Tono y Personalidad del Bot

### REGLA PRINCIPAL: El bot NO debe sonar a ficha tecnica

El bot debe sonar como un vendedor amable que conversa, NO como un catalogo.

### Ejemplos de tono

```
MAL (ficha tecnica):
  "Respaldo Capitone Premium. Material: Ecocuero. Medidas disponibles:
   1P, 1.5P, 2P, Queen, King. Precio King: $189.990. Plazo: 10 dias habiles."

BIEN (vendedor conversacional):
  "El capitone en king te queda a $189.990, va en ecocuero que es super
   facil de limpiar. Lo fabricamos en unos 10 dias. Te interesa en algun
   color en particular?"
```

```
MAL (robot):
  "Información de despacho: Santiago $5.990, Regiones desde $12.990.
   Plazo de entrega: 3-5 días hábiles post fabricación."

BIEN (natural):
  "A Santiago el despacho sale $5.990 y llega en unos 3-5 dias despues
   de fabricado. Si eres de region me dices tu comuna y te cotizo."
```

### Como se implementa

El tono se controla desde el **system prompt** en `visual-flow-engine.js`. Se actualiza para incluir instrucciones claras:

```
Eres un vendedor amable de Respaldos Chile que conversa por WhatsApp/Instagram.

ESTILO:
- Habla como una persona real, no como un catalogo
- Usa lenguaje casual pero profesional (chileno neutro)
- Haz preguntas para entender que necesita el cliente
- Sugiere opciones en vez de listar todo
- Cierra con una pregunta ("te interesa?", "en que color lo buscas?")
- Maximo 3-4 lineas por mensaje

NUNCA:
- Listes especificaciones como ficha tecnica
- Uses bullets o formatos de catalogo
- Digas "Estimado/a cliente" ni "Le informamos que..."
- Inventes precios o plazos que no estan en el contexto

SI NO SABES:
- "Dejame confirmarlo con el equipo y te respondo altiro"
- NO inventes informacion
```

### El tono se aprende tambien

Cuando el sistema extrae pares Q&A de los agentes humanos, captura tambien el **tono natural** con el que el agente respondio. Si los agentes hablan de forma casual y cercana, el bot aprende a responder asi porque el contexto inyectado tiene ese estilo.

---

## Comportamiento de Respuesta: Fidelidad, Delay y Mensajes Multiples

### 1. Nivel de Fidelidad (configurable por negocio)

El bot puede responder de formas distintas segun que tan "libre" lo dejemos respecto a las respuestas aprendidas de los agentes. Esto se configura con `LEARNING_FIDELITY_LEVEL`:

| Nivel | Nombre | Que hace | Ejemplo |
|-------|--------|----------|---------|
| `exact` | Respuesta exacta | Repite la respuesta del agente tal cual, sin cambiar nada | Agente dijo: "El capitone en king te queda a $189.990" → Bot dice exactamente eso |
| `polished` | Redaccion pulida | Mejora ortografia y formato, pero mantiene el contenido y estilo | Agente dijo: "el capitone en king qda a 189990" → Bot dice: "El capitone en king te queda a $189.990" |
| `enhanced` | Mejorada | Mantiene la info pero puede reorganizar, agregar cortesia, cerrar con pregunta | Agente dijo: "capitone king 189990 ecocuero" → Bot dice: "El capitone en king te queda a $189.990, va en ecocuero. Te interesa en algun color?" |
| `creative` | Fluir libre | GPT usa la info aprendida como base pero genera respuestas naturales y conversacionales libremente | GPT toma la info y responde con su propio estilo natural, manteniendo los datos correctos |

```
Ejemplo con la misma respuesta base del agente:
"capitone king 189990 ecocuero 10 dias"

exact:    "capitone king 189990 ecocuero 10 dias"
polished: "Capitone king $189.990, ecocuero, 10 dias."
enhanced: "El capitone en king te queda a $189.990, va en ecocuero y lo
           fabricamos en unos 10 dias. Te interesa?"
creative: "Buena eleccion! El capitone es de los mas pedidos. En king te
           queda a $189.990 y va en ecocuero que es super facil de limpiar.
           Lo tenemos listo en unos 10 dias. En que color lo andas buscando?"
```

### Como se implementa la fidelidad

Se controla en el **system prompt** que se pasa a GPT:

```javascript
function getFidelityInstruction(level) {
  switch (level) {
    case 'exact':
      return `RESPONDE usando las respuestas del equipo TAL CUAL, sin modificar
              ni una palabra. Copia la respuesta exacta.`;
    case 'polished':
      return `RESPONDE usando las respuestas del equipo como base. Puedes corregir
              ortografia y formato, pero NO cambies el contenido ni agregues info.`;
    case 'enhanced':
      return `RESPONDE usando la informacion de las respuestas del equipo. Puedes
              reorganizar, mejorar la redaccion y agregar cortesia. Cierra con
              una pregunta cuando sea apropiado. Mantén los datos exactos.`;
    case 'creative':
      return `USA la informacion de las respuestas del equipo como referencia.
              Responde de forma natural y conversacional con tu propio estilo.
              Los datos (precios, plazos, medidas) deben ser exactos, pero la
              forma de decirlo es libre. Se vendedor, no robot.`;
  }
}
```

### 2. Delay Realista (simular escritura humana)

El bot NO debe responder al instante. Una respuesta inmediata se siente robotica. Simulamos un delay realista como si alguien estuviera escribiendo.

### Formula de calculo

```javascript
function calculateTypingDelay(text) {
  // Velocidad promedio de escritura en WhatsApp: ~35-45 palabras por minuto
  // = ~3 caracteres por segundo (incluyendo pensar)
  const CHARS_PER_SECOND = 3.5;
  const MIN_DELAY = 1500;   // minimo 1.5 segundos (nadie responde mas rapido)
  const MAX_DELAY = 12000;  // maximo 12 segundos (si no, parece que se cayo)

  const charCount = text.length;
  const calculatedDelay = (charCount / CHARS_PER_SECOND) * 1000;

  // Agregar variacion aleatoria (+-20%) para que no sea roboticamente exacto
  const variation = calculatedDelay * (0.8 + Math.random() * 0.4);

  return Math.min(MAX_DELAY, Math.max(MIN_DELAY, Math.round(variation)));
}
```

### Ejemplos de delay

| Texto | Largo | Delay calculado |
|-------|-------|----------------|
| "Hola! Como estas?" | 19 chars | ~2.2 seg |
| "El capitone en king te queda a $189.990" | 41 chars | ~3.5 seg |
| "Va en ecocuero que es super facil de limpiar. Lo fabricamos en unos 10 dias habiles. Te interesa en algun color?" | 112 chars | ~8.0 seg |
| Respuesta larga de 300+ chars | 300 chars | 12 seg (max) |

### Indicador "escribiendo..."

Antes de enviar el mensaje, se activa el indicador de "escribiendo" (typing indicator) de WhatsApp/Instagram para que el cliente vea que alguien esta respondiendo:

```javascript
async function sendWithTypingDelay(phone, text, channel) {
  // 1. Activar indicador "escribiendo..."
  if (channel === 'whatsapp') {
    await whatsappAdapter.markTyping(phone);  // API de WhatsApp soporta esto
  }
  // Instagram no tiene typing indicator nativo en la API

  // 2. Esperar delay calculado
  const delay = calculateTypingDelay(text);
  await sleep(delay);

  // 3. Enviar mensaje
  await sendMessage(phone, text, channel);
}
```

### 3. Dividir Respuestas Largas en Multiples Mensajes

Nadie en WhatsApp escribe un parrafo de 6 lineas seguidas. La gente envia mensajes cortos, de 1-3 lineas. El bot debe hacer lo mismo.

### Regla de division

```
SI la respuesta tiene mas de 3-4 lineas o mas de ~150 caracteres:
  → Dividir en 2-3 mensajes separados
  → Cada mensaje de 1-3 lineas maximo
  → Delay entre cada mensaje (como si escribiera)
```

### Como se divide

```javascript
function splitResponse(text) {
  // Punto de corte natural: salto de linea doble, punto seguido, o cambio de tema
  const MAX_CHARS_PER_MSG = 180;  // ~3 lineas de WhatsApp

  // Si es corto, no dividir
  if (text.length <= MAX_CHARS_PER_MSG) {
    return [text];
  }

  const parts = [];
  const sentences = text.split(/(?<=[.!?])\s+/);  // dividir por oraciones
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > MAX_CHARS_PER_MSG && current) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }
  if (current.trim()) parts.push(current.trim());

  // Maximo 3 mensajes (si es mas largo, no dividir mas)
  if (parts.length > 3) {
    return [
      parts.slice(0, Math.ceil(parts.length / 2)).join(' '),
      parts.slice(Math.ceil(parts.length / 2)).join(' ')
    ];
  }

  return parts;
}
```

### Ejemplo de division

```
GPT genera:
  "El capitone en king te queda a $189.990, va en ecocuero que es super
   facil de limpiar. Lo fabricamos en unos 10 dias habiles. Si quieres
   te lo puedo hacer en el color que prefieras, tenemos como 20 colores
   disponibles. Y el despacho a Santiago sale $5.990."

El bot envia:

  [Msg 1] "El capitone en king te queda a $189.990, va en ecocuero
           que es super facil de limpiar."
    (delay 3.5 seg)
    (typing indicator)
  [Msg 2] "Lo fabricamos en unos 10 dias habiles. Si quieres te lo
           puedo hacer en el color que prefieras, tenemos como 20
           colores disponibles."
    (delay 4.0 seg)
    (typing indicator)
  [Msg 3] "Y el despacho a Santiago sale $5.990 🚚"
```

Se siente mucho mas natural que un solo bloque de texto.

### Flujo completo de envio

```
GPT genera respuesta completa
            |
            v
    splitResponse(text)
    → ["msg1", "msg2", "msg3"]
            |
            v
    Para cada parte:
      1. Activar typing indicator
      2. Esperar calculateTypingDelay(parte)
      3. Enviar parte
      4. Si hay mas partes, delay extra de 500ms
            |
            v
    Cliente recibe 2-3 mensajes
    cortos, con pausa natural entre cada uno
```

### Pseudocodigo del handler completo

```javascript
async function sendBotResponse(phone, fullText, channel) {
  const parts = splitResponse(fullText);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // 1. Typing indicator
    if (channel === 'whatsapp') {
      await whatsappAdapter.markTyping(phone);
    }

    // 2. Delay proporcional al texto
    const delay = calculateTypingDelay(part);
    await sleep(delay);

    // 3. Enviar parte
    await sendMessage(phone, part, channel);

    // 4. Pausa extra entre mensajes (500ms)
    if (i < parts.length - 1) {
      await sleep(500);
    }
  }
}
```

### Configuracion

```env
LEARNING_FIDELITY_LEVEL=enhanced     # exact | polished | enhanced | creative
LEARNING_TYPING_SPEED=3.5            # caracteres por segundo (simular escritura)
LEARNING_MAX_MSG_LENGTH=180          # largo maximo por mensaje antes de dividir
```

---

## Configuracion (.env)

```env
# ========================================
# Ya existentes (NO cambiar)
# ========================================
OPENAI_API_KEY=sk-...                           # API key de OpenAI
OPENAI_EMBEDDINGS_MODEL=text-embedding-3-small  # Modelo de embeddings

# ========================================
# Nuevas variables para el sistema de aprendizaje
# ========================================
LEARNING_ENABLED=true             # true/false - Activar sistema de aprendizaje
LEARNING_MIN_QUALITY=50           # 0-100 - Score minimo para usar en respuestas
LEARNING_AUTO_APPROVE=false       # true/false - Auto-aprobar pares con score >= 80
LEARNING_VISION_ENABLED=true      # true/false - Usar GPT-4o Vision para analizar fotos de productos
LEARNING_CONTEXT_MESSAGES=30      # Cantidad de mensajes crudos a cargar (se agrupan en turnos automaticamente)
LEARNING_FIDELITY_LEVEL=enhanced  # exact | polished | enhanced | creative
LEARNING_TYPING_SPEED=3.5        # caracteres por segundo para simular escritura humana
LEARNING_MAX_MSG_LENGTH=180       # largo maximo por mensaje antes de dividir en multiples
```

### Explicacion de cada variable

| Variable | Tipo | Default | Que controla |
|----------|------|---------|--------------|
| `LEARNING_ENABLED` | boolean | `false` | Si esta en `false`, no se extraen pares ni se generan embeddings. El chatbot funciona como antes. |
| `LEARNING_MIN_QUALITY` | number | `50` | Solo se usan pares con score >= este valor para inyectar contexto |
| `LEARNING_AUTO_APPROVE` | boolean | `false` | Si es `true`, los pares con score >= 80 se aprueban automaticamente sin revision manual |
| `LEARNING_VISION_ENABLED` | boolean | `false` | Si es `true`, analiza imagenes de productos con GPT-4o Vision para buscar en Q&A aprendidos |
| `LEARNING_CONTEXT_MESSAGES` | number | `30` | Mensajes crudos a cargar (se agrupan en turnos automaticamente). 30 crudos ≈ 10-15 turnos reales |
| `LEARNING_FIDELITY_LEVEL` | string | `enhanced` | Nivel de fidelidad: `exact` (copia textual), `polished` (mejora formato), `enhanced` (reorganiza y agrega cortesia), `creative` (fluye libre manteniendo datos) |
| `LEARNING_TYPING_SPEED` | number | `3.5` | Caracteres por segundo para calcular delay de escritura. Menor = mas lento, mas humano |
| `LEARNING_MAX_MSG_LENGTH` | number | `180` | Largo maximo en chars por mensaje. Mensajes mas largos se dividen en multiples envios |

---

## Diagrama de Flujo Completo

```
┌──────────────────────────────────────────────────────────────────┐
│                    CICLO DE APRENDIZAJE                          │
│                                                                  │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐  │
│  │   Cliente    │────>│   Agente     │────>│  Conversacion   │  │
│  │  pregunta    │     │  responde    │     │  resuelta       │  │
│  └─────────────┘     └──────────────┘     └────────┬────────┘  │
│                                                     │           │
│                                                     v           │
│                                            ┌────────────────┐   │
│                                            │ conversation-  │   │
│                                            │ learner.js     │   │
│                                            │                │   │
│                                            │ Extrae Q&A     │   │
│                                            │ Puntua calidad │   │
│                                            └───────┬────────┘   │
│                                                    │            │
│                                                    v            │
│                                           ┌────────────────┐    │
│                                           │learned_qa_pairs│    │
│                                           │ status: pending│    │
│                                           └───────┬────────┘    │
│                                                   │             │
│                              ┌────────────────────┤             │
│                              │                    │             │
│                              v                    v             │
│                     ┌──────────────┐    ┌──────────────────┐    │
│                     │  Supervisor  │    │  Auto-approve    │    │
│                     │  revisa      │    │  (score >= 80)   │    │
│                     │  aprueba     │    │  si esta activo  │    │
│                     └──────┬───────┘    └────────┬─────────┘    │
│                            │                     │              │
│                            v                     v              │
│                     ┌────────────────────────────────┐          │
│                     │ learned_qa_pairs               │          │
│                     │ status: approved               │          │
│                     └───────────────┬────────────────┘          │
│                                     │                           │
│                                     v                           │
│                           ┌──────────────────┐                  │
│                           │ Job embeddings   │                  │
│                           │ (cada 5 min)     │                  │
│                           │                  │                  │
│                           │ text-embedding-  │                  │
│                           │ 3-small          │                  │
│                           └────────┬─────────┘                  │
│                                    │                            │
│                                    v                            │
│                          ┌──────────────────┐                   │
│                          │ learned_qa_pairs  │                  │
│                          │ embedding: [...]  │                  │
│                          └────────┬──────────┘                  │
│                                   │                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                   │                             │
│  CICLO DE USO:                    │                             │
│                                   v                             │
│  ┌─────────────┐       ┌──────────────────┐                    │
│  │ Nuevo cliente│──────>│ knowledge-       │                    │
│  │ pregunta     │       │ retriever.js     │                    │
│  └─────────────┘       │                  │                    │
│                         │ Busca embeddings │                    │
│                         │ similares +      │                    │
│                         │ BM25 en FAQs     │                    │
│                         └────────┬─────────┘                    │
│                                  │                              │
│                                  v                              │
│                        ┌──────────────────┐                     │
│                        │ visual-flow-     │                     │
│                        │ engine.js        │                     │
│                        │                  │                     │
│                        │ handleAIFallback │                     │
│                        │ + contexto real  │                     │
│                        └────────┬─────────┘                     │
│                                 │                               │
│                                 v                               │
│                        ┌──────────────────┐                     │
│                        │ Respuesta        │                     │
│                        │ INFORMADA        │                     │
│                        │ al cliente       │                     │
│                        └──────────────────┘                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Infraestructura Existente que se Reutiliza

### 1. Tabla `kb_chunks` (Knowledge Base)

Ya existe con soporte para embeddings. Se puede usar como almacen adicional de conocimiento curado (manuales, documentos, etc.). El sistema de aprendizaje crea su propia tabla (`learned_qa_pairs`) pero usa el mismo formato de embeddings.

### 2. Tabla `faq_entries` (FAQ)

Ya existe con busqueda BM25 implementada en `faq/faq-database.js` (NO en `faq-store.js` que es codigo muerto — ver seccion Auditoria). El retriever combina resultados de BM25 (FAQs) con busqueda vectorial (Q&A aprendidos). **Nota**: El BM25 actual necesita refactorizacion (stopwords, stemming) para ser confiable.

### 3. Variables de entorno

- `OPENAI_API_KEY` - Ya configurada
- `OPENAI_EMBEDDINGS_MODEL` - Ya configurada como `text-embedding-3-small`
- `RAG_ENABLED` - Ya existe pero no esta conectada a nada

### 4. Patron de auto-migracion

`app-cloud.js` ya tiene un patron establecido de `CREATE TABLE IF NOT EXISTS` para auto-crear tablas al iniciar. La nueva tabla `learned_qa_pairs` sigue el mismo patron.

---

## Auditoria del Codigo Existente

> **Fecha de revision**: 2026-01-29
> Se reviso el codigo existente que el sistema de aprendizaje planea reutilizar o modificar. Se encontraron problemas importantes que hay que resolver ANTES o DURANTE la implementacion.

### Resumen rapido

| Archivo | Estado | Veredicto |
|---------|--------|-----------|
| `faq/faq-store.js` | CODIGO MUERTO | **ELIMINAR** — Nadie lo usa |
| `faq/faq-database.js` | Funcional con problemas | **REFACTORIZAR** — BM25 debil, bugs, rendimiento |
| `chatbot/message-classifier.js` | Funcional con riesgos | **MEJORAR** — Tablas faltantes, sentiment basico |
| `chatbot/visual-flow-engine.js` | Funcional, es el nucleo | **MODIFICAR** — AI fallback sin contexto (el problema central) |
| `chatbot/chatbot.js` | Limpio | **OK** — No necesita cambios para el learning system |
| `app-cloud.js` | Servidor principal | **MODIFICAR** — FAQ/RAG desconectados del chatbot |

---

### 1. `faq/faq-store.js` — CODIGO MUERTO, ELIMINAR

**Veredicto**: Este archivo NO se usa. Es codigo muerto.

**Por que**:
- Lee FAQs desde un archivo JSON (`faq-data.json`), NO desde MySQL
- En `app-cloud.js` linea 209, la variable `faqStore` se crea con `createFAQDatabase()` (de `faq-database.js`), NO con `createFAQStore()` (de este archivo)
- `createFAQStore` se importa en `app-cloud.js` pero nunca se usa en el flujo principal
- Toda la logica BM25 esta duplicada en `faq-database.js` (que SI usa MySQL)

**Impacto en el learning system**: Ninguno directo. La documentacion anterior decia "se reutiliza `faq-store.js`" — correccion: se reutiliza `faq-database.js`.

**Accion recomendada**: Eliminar `faq/faq-store.js` y su import en `app-cloud.js`. Si se necesita un respaldo, dejarlo con un comentario `// DEPRECATED - usar faq-database.js`.

---

### 2. `faq/faq-database.js` — REFACTORIZAR BM25

**Estado**: Se usa para el CRUD de FAQs (admin), pero su busqueda BM25 tiene problemas.

**Problemas encontrados**:

#### Bug: `pool.on('connection')` (linea ~16)
```javascript
// ACTUAL (buggy):
pool.on('connection', () => { /* ... */ });

// PROBLEMA: mysql2 pools no emiten el evento 'connection' asi.
// Esto no causa crash, pero el callback nunca se ejecuta.
```

#### BM25 debil: Sin stemming ni stopwords
```javascript
// ACTUAL:
function tokenize(text) {
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita acentos
    .replace(/[^a-z0-9\s]/g, '')                        // solo alfanumerico
    .split(/\s+/)                                        // split por espacios
    .filter(t => t.length > 1);                          // descarta 1 char
}

// PROBLEMA: No hay stemming (buscar "camas" no matchea "cama")
// PROBLEMA: No hay stopwords ("de", "la", "el", "en" cuentan como tokens)
// PROBLEMA: "cuanto vale" tiene 2 tokens inutiles que diluyen el score
```

#### Rendimiento: Busqueda O(n) por documento
```javascript
// ACTUAL:
const doc = docs.find(x => x.id === id);  // O(n) por cada resultado!

// MEJOR: Usar Map para lookup O(1)
const docMap = new Map(docs.map(d => [d.id, d]));
const doc = docMap.get(id);  // O(1)
```

#### Sin umbral minimo de score
```javascript
// ACTUAL: Retorna todo lo que tenga score > 0
const results = Array.from(scores.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, k);

// PROBLEMA: Un FAQ que matchea solo 1 stopword ("de") se retorna
// MEJOR: Agregar filtro minimo: .filter(([_, score]) => score > 0.1)
```

#### Rebuild completo en cada modificacion
```javascript
// ACTUAL: Cada add/update/remove llama buildIndex()
// buildIndex() recorre TODOS los docs y recalcula TODO el indice
// Con 50 FAQs es rapido, con 5000 seria lento

// PARA EL LEARNING SYSTEM: No aplica directamente (learned_qa_pairs usa embeddings,
// no BM25). Pero si se sigue usando faq_entries con BM25, hay que optimizar.
```

**Impacto en el learning system**: El `knowledge-retriever.js` planea combinar busqueda vectorial (para `learned_qa_pairs`) con BM25 (para `faq_entries`). Si el BM25 retorna resultados irrelevantes por falta de stopwords/stemming, ensucia el contexto de GPT.

**Acciones recomendadas**:
1. Agregar lista de stopwords en español (~50 palabras: "de", "la", "el", "en", "un", "que", etc.)
2. Agregar stemming basico (al menos truncar plurales: "camas" → "cama", "respaldos" → "respaldo")
3. Usar `Map` para lookup de documentos en vez de `find()`
4. Agregar umbral minimo de score (ej: > 0.1)
5. Corregir `pool.on('connection')` o eliminarlo si no es necesario

---

### 3. `chatbot/message-classifier.js` — MEJORAR

**Estado**: Clasifica intenciones, urgencia, sentimiento y lead score. Funciona pero es basico.

**Problemas encontrados**:

#### Tablas que pueden no existir
```javascript
// El classifier depende de estas tablas:
// - classifier_rules      (reglas de clasificacion)
// - lead_scores           (scoring de leads)
// - message_classifications (log de clasificaciones)
//
// PROBLEMA: No hay CREATE TABLE IF NOT EXISTS para estas tablas.
// Si no existen, las queries fallan silenciosamente (try/catch).
// El classifier retorna clasificaciones vacias sin error visible.
```

#### Sentiment demasiado basico
```javascript
// ACTUAL: Solo 9 palabras positivas y 9 negativas hardcodeadas
const positiveWords = ['gracias', 'perfecto', 'genial', 'excelente', 'bueno', 'bien', 'ok', 'dale', 'listo'];
const negativeWords = ['malo', 'pesimo', 'horrible', 'lento', 'caro', 'problema', 'queja', 'reclamo', 'mala'];

// PROBLEMA: "no me gusto" → neutral (no tiene "gusto" en la lista)
// PROBLEMA: "mala" esta pero "mal" no
// PROBLEMA: No detecta negaciones ("no esta bien" → cuenta "bien" como positivo)
```

#### Matching de reglas con `includes()` — falsos positivos
```javascript
// ACTUAL:
message.includes(pattern)

// PROBLEMA: "malo" matchea dentro de "maloca" o "anomalo"
// PROBLEMA: "precio" matchea dentro de "deprecio"
// MEJOR: Usar word boundaries: new RegExp(`\\b${pattern}\\b`, 'i')
```

**Impacto en el learning system**: Bajo impacto directo. El `message-classifier.js` se usa para intent-matching de flujos visuales, no para el retriever. Pero si se quiere usar la clasificacion para mejorar el quality_score (ej: +10 si el sentimiento del cliente fue positivo despues), el sentiment actual no es confiable.

**Acciones recomendadas**:
1. Agregar `CREATE TABLE IF NOT EXISTS` para las 3 tablas en `app-cloud.js`
2. Expandir diccionario de sentimiento (al menos 30+ palabras por categoria)
3. Cambiar `includes()` por regex con word boundaries `\b`
4. (Opcional) Detectar negaciones basicas ("no + palabra_positiva" = negativo)

---

### 4. `chatbot/visual-flow-engine.js` — PUNTO CRITICO DE MODIFICACION

**Estado**: Es el motor principal del chatbot. `handleAIFallback()` es exactamente donde el learning system se integra.

**Problemas encontrados (relevantes al learning system)**:

#### `handleAIFallback()` no tiene contexto (lineas 193-247)
```javascript
// ACTUAL: Solo pasa el mensaje actual a GPT, sin historial ni conocimiento
const aiResponse = await this.openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: systemPrompt },  // prompt generico
    { role: 'user', content: message }            // SOLO el mensaje actual
  ],
  temperature: 0.7,   // Demasiado alta para respuestas factuales
  max_tokens: 150      // Demasiado bajo para respuestas conversacionales
});

// PROBLEMAS:
// 1. Sin historial → cada mensaje es independiente
// 2. Sin conocimiento del negocio → no puede dar info real
// 3. temperature 0.7 → genera "creativamente" cuando no deberia
// 4. max_tokens 150 → corta respuestas a la mitad
```

**Este es exactamente el problema que el learning system resuelve**. La modificacion planificada reemplaza este bloque con contexto aprendido + historial + precios.

#### `sessionStates` en memoria (Map)
```javascript
// ACTUAL:
this.sessionStates = new Map();

// PROBLEMA: Si el servidor se reinicia, todos los estados de sesion se pierden.
// Un usuario a mitad de un flujo visual pierde su progreso.
// No es critico para el learning system (usa BD), pero afecta la experiencia.
```

#### Keywords globales hardcodeadas
```javascript
// ACTUAL (lineas 21-29):
this.globalKeywords = ['menu', 'menú', 'inicio', 'ayuda', 'help',
                        'agente', 'humano', 'persona', 'salir',
                        'cancelar', 'hola', 'buenos días'];

// No es un problema grave, pero estas keywords interceptan mensajes
// ANTES de que lleguen al AI fallback. Si un cliente dice "hola quiero
// cotizar un respaldo", el "hola" puede triggerear un flujo de bienvenida
// en vez de llegar al AI fallback con conocimiento.
```

#### Parametros de GPT suboptimos
```
temperature: 0.7   →  Recomendado: 0.3-0.4 para respuestas con datos reales
max_tokens: 150    →  Recomendado: 300-400 para respuestas conversacionales completas
```

**Acciones recomendadas para el learning system**:
1. Modificar `handleAIFallback()` para recibir contexto del `knowledge-retriever.js`
2. Agregar historial conversacional con `getRecentContext()`
3. Bajar `temperature` a 0.3 y subir `max_tokens` a 350
4. (Opcional) Persistir `sessionStates` en BD (Redis o MySQL)
5. Actualizar system prompt con instrucciones de tono y fidelidad

---

### 5. `chatbot/chatbot.js` — OK, NO REQUIERE CAMBIOS

**Estado**: Limpio, refactorizado (tiene comentario "VERSION LIMPIA"). Actua como orquestador.

**Lo que hace**:
- Crea `VisualFlowEngine` y `MessageClassifier`
- `handleChatbotMessage()`: chequea modo (manual/automatic), llama a `visualFlowEngine.processMessage()`
- Fallback (lineas 211-214): si nada responde, envia mensaje generico desde `chatbot_config` table

**Observacion**: No tiene integracion con FAQ ni knowledge base. La FAQ esta 100% desconectada del chatbot — solo se accede via admin API. El learning system no necesita modificar este archivo porque la integracion va directamente en `visual-flow-engine.js`.

---

### 6. `app-cloud.js` — DESCONEXION FAQ/RAG

**Estado**: El servidor principal tiene FAQ y RAG pero ninguno esta conectado al chatbot.

**Hallazgos clave**:

```
HALLAZGO 1: faqStore usa faq-database.js, NO faq-store.js
  - Linea 209: faqStore = createFAQDatabase({ pool, logger })
  - createFAQStore esta importado pero no se usa en el flujo principal

HALLAZGO 2: FAQ solo para admin CRUD
  - Las rutas de FAQ (lineas ~2337, 2351, 4589-4756) son endpoints REST
  - GET/POST/PUT/DELETE para gestionar FAQs desde el panel
  - PERO: Ningun endpoint pasa resultados de FAQ al chatbot

HALLAZGO 3: RAG existe pero esta deshabilitado
  - Tabla kb_chunks existe con soporte de embeddings (lineas 537-549)
  - RAG_ENABLED=false en .env
  - Hay endpoints de busqueda RAG pero standalone (no conectados al chatbot)

HALLAZGO 4: El chatbot se instancia sin knowledge
  - Lineas 5720-5729: se crea el Chatbot con sus dependencias
  - No recibe faqStore, ni retriever, ni RAG — solo pool, openai, logger
```

**Impacto en el learning system**: Esto confirma que la infraestructura existe pero esta desconectada. El learning system basicamente **conecta los puntos**: toma el conocimiento (learned_qa_pairs + faq_entries + product_prices) y lo inyecta donde falta (handleAIFallback).

**Acciones para el learning system**:
1. Agregar `CREATE TABLE IF NOT EXISTS` para `learned_qa_pairs` y `product_prices`
2. Instanciar `conversation-learner.js` y `knowledge-retriever.js`
3. Pasar `knowledgeRetriever` al `VisualFlowEngine`
4. Hook en cambio de status a "resolved" para extraer Q&A
5. `setInterval` para job de embeddings
6. Montar rutas `/api/learning`
7. (Limpiar) Eliminar import de `createFAQStore` si ya no se usa

---

### Conclusion de la auditoria

**Lo bueno**:
- La estructura base del chatbot es solida (visual-flow-engine funciona bien para flujos)
- MySQL con soporte de embeddings ya esta (tabla `kb_chunks`)
- El patron de auto-migracion de tablas ya esta establecido
- `chatbot.js` ya esta limpio y refactorizado

**Lo que hay que arreglar**:
1. **ELIMINAR** `faq-store.js` (codigo muerto)
2. **REFACTORIZAR** `faq-database.js` BM25 (stopwords, stemming, Map lookup, umbral minimo)
3. **AGREGAR** tablas faltantes del classifier en auto-migracion
4. **CONECTAR** el conocimiento al chatbot (el trabajo principal del learning system)
5. **AJUSTAR** parametros de GPT (temperature, max_tokens)

**Lo que NO hay que tocar**:
- `chatbot.js` — Ya esta bien, el learning system se integra en `visual-flow-engine.js`
- `channels/*` — Los canales de WhatsApp/Instagram no se modifican
- `frontend/*` — El panel admin no cambia (la API de learning se puede usar via panel existente)

---

## Resumen de Archivos

### Archivos nuevos a crear

| Archivo | Lineas estimadas | Que hace |
|---------|-----------------|----------|
| `chatbot/conversation-learner.js` | ~250 | Extrae Q&A de conversaciones resueltas, puntua calidad (criterios base + rubro), genera embeddings |
| `chatbot/knowledge-retriever.js` | ~250 | Busqueda hibrida (vectorial + BM25), consulta tabla de precios, formatea contexto, handler de imagenes con Vision |
| `api/learning-routes.js` | ~150 | API REST para gestionar pares (CRUD + stats) y precios vigentes |

### Archivos existentes a modificar

| Archivo | Cambios |
|---------|---------|
| `chatbot/visual-flow-engine.js` | Inyectar contexto del retriever en `handleAIFallback()`. Recibir `knowledgeRetriever` en constructor. Actualizar system prompt con tono conversacional. Handler de imagenes de producto. |
| `app-cloud.js` | Crear tablas `learned_qa_pairs` y `product_prices` (auto-migracion). Montar rutas `/api/learning`. Hook en resolucion de conversacion. `setInterval` para job de embeddings. Detectar imagen + consulta de producto en webhook. |
| `.env` | Agregar 8 variables nuevas (ver seccion Configuracion) |

### Archivos a refactorizar (encontrados en auditoria)

| Archivo | Accion | Detalle |
|---------|--------|---------|
| `faq/faq-store.js` | **ELIMINAR** | Codigo muerto. Lee de JSON, no de MySQL. Nadie lo usa. |
| `faq/faq-database.js` | **REFACTORIZAR** | BM25 sin stopwords ni stemming, lookup O(n), sin umbral. Ver seccion Auditoria. |

### Archivos que NO se tocan

- `chatbot/chatbot.js` — No se modifica (limpio, el learning system va en visual-flow-engine)
- `chatbot/message-classifier.js` — No se modifica para el learning system (mejoras opcionales listadas en auditoria)
- `channels/*` — No se modifica
- `frontend/*` — No se modifica (la API admin se puede usar con curl o Postman por ahora)

---

## Plan de Verificacion

### Test 1: Extraccion de Q&A
1. Abrir una conversacion en el panel
2. Responder como agente humano (con respuestas detalladas)
3. Marcar la conversacion como "resuelta"
4. Verificar en BD: `SELECT * FROM learned_qa_pairs WHERE session_id = X`
5. Verificar que se crearon pares con quality_score > 0

### Test 2: Aprobacion y Embeddings
1. Aprobar un par via API: `PATCH /api/learning/pairs/1 { "status": "approved" }`
2. Esperar 5 minutos (o forzar el job manualmente)
3. Verificar en BD: `SELECT id, LENGTH(JSON_EXTRACT(embedding, '$')) FROM learned_qa_pairs WHERE id = 1`
4. Verificar que embedding no es NULL y tiene contenido

### Test 3: Contexto en Respuestas
1. Enviar un mensaje al chatbot con una pregunta similar a un par aprendido
2. Verificar en logs que `knowledge-retriever` encontro resultados
3. Verificar que la respuesta del chatbot incluye informacion del contexto

### Test 4: Graceful Fallback
1. Desactivar `LEARNING_ENABLED=false`
2. Enviar mensaje al chatbot
3. Verificar que sigue respondiendo normalmente (sin contexto aprendido)
4. Verificar que no hay errores en logs

### Test 5: Memoria conversacional
1. Enviar al chatbot: "cuanto vale el capitone en king?"
2. Esperar respuesta con precio
3. Enviar: "y en queen?"
4. Verificar que el bot responde sobre el capitone en queen (NO dice "no entiendo")
5. Enviar: "ok y cuanto se demoran?"
6. Verificar que el bot entiende que pregunta por el plazo de fabricacion del capitone

### Test 6: Precios desde tabla vigente
1. Insertar un precio en `product_prices`: Capitone King = $189.990
2. Tener un Q&A aprendido con precio viejo ($179.990)
3. Preguntar al bot: "cuanto vale el capitone en king?"
4. Verificar que el bot responde con $189.990 (precio de la tabla) y NO $179.990 (precio del Q&A)
5. Eliminar el precio de la tabla
6. Preguntar de nuevo
7. Verificar que el bot NO inventa un precio, sino que dice "dejame confirmar el precio"

### Test 7: Consulta con imagen
1. Enviar una foto de un respaldo por WhatsApp/Instagram con texto "cuanto vale este?"
2. Verificar en logs que GPT-4o Vision genero una descripcion de la imagen
3. Verificar que el retriever busco con la descripcion
4. Si hay pares similares: verificar que el bot responde con info del producto
5. Si no hay pares: verificar que el bot dice "dejame revisar con el equipo"

### Test 8: Tono conversacional
1. Enviar pregunta de precio al chatbot
2. Verificar que la respuesta NO tiene formato de ficha tecnica (bullets, especificaciones)
3. Verificar que suena como un vendedor conversando (casual, pregunta al final)

### Test 9: Nivel de fidelidad
1. Configurar `LEARNING_FIDELITY_LEVEL=exact`
2. Preguntar algo que tenga un Q&A aprendido
3. Verificar que la respuesta es identica a la del agente
4. Cambiar a `enhanced`
5. Preguntar lo mismo
6. Verificar que la respuesta tiene la misma info pero mejorada con cortesia

### Test 10: Delay y mensajes multiples
1. Preguntar algo que genere una respuesta larga (150+ chars)
2. Verificar que el bot NO responde al instante (hay delay)
3. Verificar que la respuesta llega en 2-3 mensajes separados (no un solo bloque)
4. Verificar que hay pausa entre cada mensaje (typing indicator visible en WhatsApp)
5. Preguntar algo corto ("hola")
6. Verificar que responde en 1 solo mensaje con delay minimo (~2 seg)

### Test 11: No afecta canales existentes
1. Enviar mensaje por WhatsApp — funciona normal
2. Enviar mensaje por Instagram — funciona normal
3. Panel web — funciona normal

---

## Consideraciones y Riesgos

### Seguridad
- Los pares aprendidos pueden contener informacion sensible de clientes
- El supervisor debe revisar antes de aprobar (o usar `LEARNING_AUTO_APPROVE=false`)
- La API `/api/learning` requiere autenticacion (mismo middleware que el resto)

### Costo
- Embeddings con `text-embedding-3-small` son muy baratos (~$0.02/millon tokens)
- Con 100 pares/dia = ~2,000 tokens/dia = ~$0.00004/dia
- El costo real esta en las llamadas a GPT-4o-mini al responder (ya existe)

### Rendimiento
- La busqueda vectorial se hace en MySQL (no hay Pinecone/Weaviate)
- Con < 10,000 pares, la busqueda en memoria es rapida
- Si escala, se puede migrar a una BD vectorial dedicada en el futuro

### Calidad
- El auto-approve puede dejar pasar pares malos si el score no es preciso
- Recomendacion: empezar con `LEARNING_AUTO_APPROVE=false` y revisar manualmente
- Una vez que se valide la calidad del scoring, activar auto-approve

### Privacidad
- Los pares contienen texto de conversaciones reales
- No se almacenan datos personales del cliente (solo la pregunta/respuesta)
- Cumple con la politica de privacidad si los datos se anonimizaron

---

**Ultima actualizacion**: 2026-01-29
**Autor**: Claude Code
