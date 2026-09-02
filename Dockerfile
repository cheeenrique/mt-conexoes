FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ⚠️ Valores de brinquedo, só para o build passar. `lib/crypto.ts` avalia
# CREDENTIAL_KEY no import (`const KEY = getKey()`), de propósito: chave ausente
# tem que derrubar o container no boot, não na primeira credencial. Mas isso faz
# `next build` importar o módulo e falhar em "Failed to collect page data" na
# rota de cron que o alcança. Mesmos valores do job `checks` em ci.yml.
#
# NÃO chegam ao runtime: o estágio final é outro FROM, e o Cloud Run injeta os
# valores reais a partir do Secret Manager (--set-secrets em 30-deploy.sh).
ENV CREDENTIAL_KEY=Q0hBTkdFLU1FLWRldi1jcmVkZW50aWFsLWtleS0zMmI= \
    SESSION_SECRET=build-time-placeholder-32-bytes-ok \
    CRON_SECRET=build-time-placeholder \
    META_WEBHOOK_VERIFY_TOKEN=build-time-placeholder \
    APP_URL=http://localhost:3000

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
