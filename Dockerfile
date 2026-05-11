FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY public/ ./public/
COPY templates/ ./templates/

EXPOSE 3000

CMD ["npm", "start"]
