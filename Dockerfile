FROM node:20-alpine

WORKDIR /app

# Copiar package.json primero para aprovechar cache
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el resto del código
COPY . .

# Crear directorio de logs
RUN mkdir -p logs

EXPOSE 3001

# Usar CMD con sh -c para ejecutar migraciones antes de iniciar
CMD ["sh", "-c", "node scripts/auto-migrate.js && node --dns-result-order=ipv4first --max-old-space-size=512 app-cloud.js"]
