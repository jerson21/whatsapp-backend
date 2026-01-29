# 🤖 Chat Tester - Simulador General de Chatbot

## 📝 Descripción

El **Chat Tester** es un simulador completo del chatbot que permite probar todo el sistema de conversaciones **sin necesidad de credenciales de WhatsApp o Instagram**.

Simula exactamente como si llegara un mensaje real desde WhatsApp/Instagram, ejecutando:
- ✅ Visual Flow Engine (flujos conversacionales)
- ✅ Message Classifier (clasificación de mensajes)
- ✅ Respuestas automáticas
- ✅ Keywords globales (menu, ayuda, agente, salir)
- ✅ Guardado en base de datos
- ✅ Emisión de eventos SSE y Socket.IO

---

## 🚀 Acceso

```
http://localhost:3001/chat-tester
```

O en producción:
```
https://tu-dominio.com/chat-tester
```

---

## 💡 Cómo Usar

### 1. **Configurar Número de Teléfono**
   - Por defecto usa: `+56912345678`
   - Puedes cambiar el número en el campo superior
   - Click en "Actualizar Número" para aplicar

### 2. **Enviar Mensajes**
   - Escribe un mensaje en el campo de texto inferior
   - Presiona Enter o click en el botón de envío
   - El mensaje se procesa exactamente como si viniera de WhatsApp

### 3. **Ver Respuestas del Bot**
   - Las respuestas aparecen automáticamente
   - Se muestran con indicador de "escribiendo..." (typing)
   - Los mensajes del bot aparecen a la izquierda (gris)
   - Tus mensajes aparecen a la derecha (morado)

### 4. **Información de Sesión**
   - **Estado**: Muestra si está conectado
   - **Mensajes**: Contador de mensajes enviados/recibidos
   - **Sesión**: ID de la sesión creada en la base de datos

---

## 🧪 Casos de Uso

### **Testing de Flujos Completos**
Prueba flujos conversacionales completos sin depender de WhatsApp:

```
Usuario: Hola
Bot: (ejecuta trigger de saludo)

Usuario: Quiero información
Bot: (ejecuta flujo de ventas/soporte)

Usuario: menu
Bot: (muestra menú principal)
```

### **Probar Keywords Globales**
```
Usuario: menu     → Muestra menú principal
Usuario: ayuda    → Muestra comandos disponibles
Usuario: agente   → Transfiere a humano
Usuario: salir    → Termina conversación
```

### **Desarrollo sin Credenciales**
- Desarrolla y prueba sin necesidad de configurar WhatsApp API
- Ideal para ambiente de desarrollo local
- No requiere `WABA_PHONE_NUMBER_ID` ni `META_ACCESS_TOKEN`

### **Testing de Múltiples Números**
- Cambia el número de teléfono para simular diferentes usuarios
- Cada número crea su propia sesión en la base de datos
- Prueba cómo se comporta el bot con diferentes contextos

---

## 🔧 Características Técnicas

### **Endpoint de Simulación**
```
POST /api/chat/simulate
Content-Type: application/json

{
  "phone": "+56912345678",
  "message": "Hola, necesito ayuda"
}
```

### **Respuesta del Endpoint**
```json
{
  "ok": true,
  "sessionId": 42,
  "messageId": 123,
  "responses": [
    "¡Hola! ¿En qué puedo ayudarte?",
    "Estoy aquí para resolver tus dudas."
  ],
  "flowExecuted": true,
  "flowName": "Flujo de Bienvenida",
  "message": null
}
```

### **Qué Hace el Simulador**

1. **Crea/Busca Sesión**: Busca sesión abierta o crea una nueva
2. **Guarda Mensaje**: Inserta mensaje en `chat_messages` con ID único simulado
3. **Emite Eventos**: Envía eventos por SSE y Socket.IO (visible en panel admin)
4. **Ejecuta Chatbot**: Llama a `handleChatbotMessage()` igual que webhook real
5. **Retorna Respuestas**: Obtiene respuestas del bot de la base de datos

---

## 🎨 Interfaz

### **Componentes**

- **Header**: Título y número de teléfono actual
- **Config Bar**: Cambiar número y limpiar chat
- **Stats Bar**: Estado de conexión, contador de mensajes, ID de sesión
- **Messages Container**: Área de chat con scroll automático
- **Input Container**: Campo de texto y botón de envío

### **Estados Visuales**

- **Mensajes de Usuario**: Burbujas moradas a la derecha
- **Mensajes del Bot**: Burbujas grises a la izquierda
- **Mensajes del Sistema**: Burbujas grises centradas (notificaciones)
- **Typing Indicator**: Animación de "escribiendo..." antes de respuestas

---

## 🔌 Integración con el Sistema

El simulador está **completamente integrado** con el sistema real:

- ✅ Los mensajes se guardan en la base de datos real
- ✅ Se pueden ver en el panel de administración (`/chatbot`)
- ✅ Ejecuta los mismos flujos que mensajes reales
- ✅ Respeta configuración de chatbot (CHATBOT_GLOBAL_ENABLED)
- ✅ Funciona con Visual Flows activos

---

## 📊 Comparación: Real vs Simulado

| Aspecto | WhatsApp Real | Chat Tester |
|---------|---------------|-------------|
| Requiere credenciales | ✅ Sí | ❌ No |
| Guarda en BD | ✅ Sí | ✅ Sí |
| Ejecuta flujos | ✅ Sí | ✅ Sí |
| Visible en panel | ✅ Sí | ✅ Sí |
| Emite eventos | ✅ Sí | ✅ Sí |
| ID de mensaje | Meta genera | Simula con timestamp |
| Source | `webhook POST` | `api/chat/simulate POST` |

---

## 🐛 Debugging

### **Ver Logs del Backend**
```bash
docker logs whatsapp-backend --tail=50 -f
```

Busca líneas con `🧪 SIMULACIÓN:`:
```
🧪 SIMULACIÓN: Mensaje entrante
🧪 SIMULACIÓN: Creando nueva sesión
🧪 SIMULACIÓN: Ejecutando chatbot
🧪 SIMULACIÓN: Chatbot ejecutado
```

### **Problemas Comunes**

**No hay respuestas del bot**
- Verifica que `CHATBOT_GLOBAL_ENABLED=true` en `.env`
- Verifica que `VISUAL_FLOWS_ENABLED=true`
- Crea al menos un flujo visual en `/flow-builder`

**Error "chatbot not defined"**
- El backend no terminó de inicializar
- Espera unos segundos y vuelve a intentar

**Sesión no se crea**
- Verifica conexión a MySQL
- Revisa logs del backend

---

## 🎯 Próximos Pasos

Después de probar con Chat Tester:

1. **Crear Flujos Visuales**: Accede a `/flow-builder` para crear flujos
2. **Configurar WhatsApp**: Agrega credenciales reales cuando estés listo
3. **Probar en Panel Admin**: Abre `/chatbot` para ver las conversaciones
4. **Configurar Templates**: Define templates de WhatsApp para producción

---

## 📖 Documentación Relacionada

- [README Principal](../../README.md)
- [Flow Builder](../flow-builder/README.md)
- [Panel de Chatbot](../chatbot/README.md)
- [Arquitectura](../../ARCHITECTURE.md)

---

**Desarrollado para Respaldos Chile** 🇨🇱
