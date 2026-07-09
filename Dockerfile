FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package*.json ./
# NODE_ENV=production (set above) makes npm skip devDependencies, but the build
# needs them (vite, typescript, the preact vite preset). Force-include dev deps
# for the build; they're stripped again by `npm prune --omit=dev` after build.
RUN npm ci --include=dev

COPY src/ ./src/
COPY public/ ./public/
COPY index.html vite.config.ts tsconfig.json ./

RUN npm run build && npm prune --omit=dev

EXPOSE 3000

CMD ["npm", "start"]
