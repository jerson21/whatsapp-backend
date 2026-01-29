#!/bin/sh
# Entrypoint Script
# Ejecuta migraciones automáticas antes de iniciar el servidor

set -e

echo "🚀 [ENTRYPOINT] Iniciando contenedor..."

# Ejecutar migraciones automáticas
echo "📦 [ENTRYPOINT] Ejecutando migraciones automáticas..."
node /app/scripts/auto-migrate.js || {
  echo "⚠️  [ENTRYPOINT] Migraciones fallaron, pero continuando..."
}

echo "✅ [ENTRYPOINT] Migraciones completadas"
echo "🌐 [ENTRYPOINT] Iniciando servidor..."

# Iniciar aplicación principal
exec node --dns-result-order=ipv4first app-cloud.js
