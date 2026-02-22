FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

RUN mkdir -p /data

EXPOSE 3000

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/calendario.db

CMD ["node", "server/server.js"]
