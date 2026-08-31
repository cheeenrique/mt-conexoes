FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build

FROM base AS runtime
ENV NODE_ENV=production

# O Cloud Run injeta PORT; 8080 é só o default de quem roda a imagem na mão.
ENV PORT=8080

# ⚠️ O Docker define HOSTNAME como o id do container. O server.js do build
# standalone usa essa variável como endereço de bind — sem sobrescrever, ele
# escuta num nome que só existe dentro do container e o Cloud Run marca o
# deploy como falho por não conseguir alcançar a porta.
ENV HOSTNAME=0.0.0.0

# `output: 'standalone'` (next.config.ts) emite o próprio servidor com apenas o
# node_modules que o runtime usa. Não existe `next start` nesta imagem.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# O engine do Prisma não precisa de cópia à parte: o tracing do Next já o leva
# dentro de node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client.
# Conferido no build. Não existe /app/node_modules/.prisma com pnpm — a cópia
# "por garantia" desse caminho quebra o build.

EXPOSE 8080
CMD ["node", "server.js"]
