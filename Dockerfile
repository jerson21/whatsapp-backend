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

CMD ["node", "--dns-result-order=ipv4first", "app-cloud.js"]
