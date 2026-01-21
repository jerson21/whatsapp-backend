#!/bin/bash
# ============================================================================
# setup.sh - Primera instalación del chatbot WhatsApp
# ============================================================================
# Ejecutar UNA SOLA VEZ en servidor nuevo
# Uso: ./setup.sh
# ============================================================================

set -e

echo "🚀 Setup inicial del chatbot WhatsApp..."
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Verificar que estamos en el directorio correcto
if [ ! -f "app-cloud.js" ]; then
    echo -e "${RED}❌ Error: Ejecuta este script desde el directorio del proyecto${NC}"
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js no está instalado${NC}"
    exit 1
fi

# Verificar PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PM2 no está instalado. Instalando...${NC}"
    npm install -g pm2
fi

# Verificar .env
if [ ! -f ".env" ]; then
    if [ -f ".env.production" ]; then
        echo -e "${YELLOW}📄 Copiando .env.production a .env...${NC}"
        cp .env.production .env
        echo -e "${YELLOW}⚠️  Recuerda configurar tus variables en .env${NC}"
    else
        echo -e "${RED}❌ Error: No se encontró .env ni .env.production${NC}"
        exit 1
    fi
fi

# 1. Instalar dependencias
echo -e "${YELLOW}📦 Instalando dependencias...${NC}"
npm install --production

# 2. Crear tablas y migrar datos
echo -e "${YELLOW}🗄️  Creando tablas en base de datos...${NC}"

if node migrate-chatbot-tables.js; then
    echo -e "${GREEN}✅ Tablas del chatbot creadas${NC}"
else
    echo -e "${YELLOW}⚠️  Error creando tablas (pueden ya existir)${NC}"
fi

if node migrate-faq-data.js; then
    echo -e "${GREEN}✅ Datos FAQ migrados${NC}"
else
    echo -e "${YELLOW}⚠️  Error migrando FAQ${NC}"
fi

if node migrate-categories.js; then
    echo -e "${GREEN}✅ Categorías creadas${NC}"
else
    echo -e "${YELLOW}⚠️  Error creando categorías${NC}"
fi

# 3. Crear directorio de logs
mkdir -p logs

# 4. Iniciar con PM2
echo -e "${YELLOW}🚀 Iniciando aplicación con PM2...${NC}"
pm2 start ecosystem.config.js
pm2 save

# 5. Verificar
sleep 3
if pm2 list | grep -q "whatsapp-chat.*online"; then
    echo -e "${GREEN}✅ Aplicación corriendo${NC}"
else
    echo -e "${RED}❌ Error: La aplicación no inició${NC}"
    echo "Ver logs: pm2 logs whatsapp-chat"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 ¡Setup completado!${NC}"
echo ""
echo "📋 Comandos útiles:"
echo "   • Ver logs:    pm2 logs whatsapp-chat"
echo "   • Reiniciar:   pm2 restart whatsapp-chat"
echo "   • Estado:      pm2 status"
echo ""
echo "🔧 Próximos pasos:"
echo "   1. Configurar variables en .env (API keys, etc.)"
echo "   2. Configurar webhook de WhatsApp"
echo "   3. Para actualizaciones usar: ./deploy.sh"
