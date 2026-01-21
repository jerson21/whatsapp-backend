#!/bin/bash
# ============================================================================
# deploy.sh - Deploy de actualizaciones
# ============================================================================
# Ejecutar cada vez que quieras actualizar el servidor
# Uso: ./deploy.sh
# ============================================================================

set -e

echo "🔄 Desplegando actualización..."
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

# 1. Obtener últimos cambios
echo -e "${YELLOW}📥 Obteniendo cambios de git...${NC}"
git pull origin master

# 2. Instalar dependencias (por si hay nuevas)
echo -e "${YELLOW}📦 Actualizando dependencias...${NC}"
npm install --production

# 3. Reiniciar aplicación
echo -e "${YELLOW}🔄 Reiniciando aplicación...${NC}"
pm2 restart whatsapp-chat

# 4. Verificar
sleep 3
if pm2 list | grep -q "whatsapp-chat.*online"; then
    echo -e "${GREEN}✅ Aplicación reiniciada correctamente${NC}"
else
    echo -e "${RED}❌ Error: La aplicación no reinició${NC}"
    echo "Ver logs: pm2 logs whatsapp-chat"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 ¡Deploy completado!${NC}"
echo ""
echo "Ver logs: pm2 logs whatsapp-chat"
