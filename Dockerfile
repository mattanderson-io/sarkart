FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src/ ./src/
COPY public/ ./public/
COPY templates/ ./templates/
COPY index.html vite.config.ts tsconfig.json ./

RUN npm run build && npm prune --omit=dev

EXPOSE 3000

CMD ["npm", "start"]
