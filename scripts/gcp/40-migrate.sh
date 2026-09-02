#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project

# As migrations rodam daqui, não de dentro do Cloud Run. Dois motivos: o Neon é
# Postgres público sobre TLS, alcançável da máquina; e a imagem é `standalone`,
# que não carrega o CLI do Prisma. Rodar migration no boot do serviço também
# seria errado — N instâncias subindo em paralelo disputam o mesmo lock.
DATABASE_URL="$(gcloud secrets versions access latest --secret DATABASE_URL --project "$PROJECT_ID")"
export DATABASE_URL

cd "$(dirname "$0")/../.."

echo "→ prisma migrate deploy"
pnpm exec prisma migrate deploy

# Primeiro usuário do painel. O seed não sobrescreve senha de usuário existente,
# então rodar de novo depois é seguro.
if [[ -n "${SEED_USER_EMAIL:-}" && -n "${SEED_USER_PASSWORD:-}" ]]; then
  echo "→ seed do primeiro usuário (${SEED_USER_EMAIL})"
  pnpm exec tsx prisma/seed.ts
else
  echo
  echo "seed do usuário pulado. Para criar o primeiro login:"
  echo "  SEED_USER_EMAIL=... SEED_USER_PASSWORD=... $0"
fi
