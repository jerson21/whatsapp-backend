#!/bin/bash
# ============================================================================
# deploy.sh - Deploy de actualizaciones (Docker)
# ============================================================================
# Ejecutar cada vez que quieras actualizar el servidor
# Uso: ./deploy.sh
# ============================================================================

set -e

echo "Desplegando actualizacion..."
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.prod.yml"

# Verificar que estamos en el directorio correcto
if [ ! -f "app-cloud.js" ]; then
    echo -e "${RED}Error: Ejecuta este script desde el directorio del proyecto${NC}"
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Error: No se encontro $COMPOSE_FILE${NC}"
    exit 1
fi

# 1. Obtener ultimos cambios
echo -e "${YELLOW}Obteniendo cambios de git...${NC}"
git pull origin master

# 2. Rebuild y reiniciar contenedores
echo -e "${YELLOW}Construyendo y reiniciando contenedores...${NC}"
docker compose -f "$COMPOSE_FILE" up -d --build

# 3. Verificar que todos los contenedores estan corriendo
sleep 5
echo ""
echo -e "${YELLOW}Estado de contenedores:${NC}"
docker compose -f "$COMPOSE_FILE" ps

# Verificar backend
if docker compose -f "$COMPOSE_FILE" ps --format json | grep -q '"whatsapp-backend".*"running"'; then
    echo -e "${GREEN}Backend OK${NC}"
else
    # Fallback check
    if docker ps --filter "name=whatsapp-backend" --filter "status=running" -q | grep -q .; then
        echo -e "${GREEN}Backend OK${NC}"
    else
        echo -e "${RED}Error: Backend no esta corriendo${NC}"
        echo "Ver logs: docker compose -f $COMPOSE_FILE logs backend"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}Deploy completado!${NC}"
echo ""
echo "Ver logs: docker compose -f $COMPOSE_FILE logs -f"
echo "Solo backend: docker compose -f $COMPOSE_FILE logs -f backend"
