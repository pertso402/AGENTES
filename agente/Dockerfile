# Node 22, não 20: o cliente do Supabase usa o WebSocket nativo, que só existe
# de forma estável a partir do 22. No 20 o agente sobe, mas toda consulta ao
# banco falha com "native WebSocket not found" — e a máquina de desenvolvimento
# (Node 24) não reproduzia o problema.
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
