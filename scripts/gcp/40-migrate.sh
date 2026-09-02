#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project

# As migrations rodam daqui (ou do CI), nunca de dentro do Cloud Run: a imagem
# `standalone` não carrega o CLI do Prisma, e migration no boot faria N
# instâncias subindo em paralelo disputarem o mesmo lock.
#
# A DATABASE_URL do Secret Manager aponta para o socket unix que só existe
# dentro do Cloud Run. Daqui o caminho é o proxy: autentica por IAM e expõe a
# instância em 127.0.0.1, sem abrir rede autorizada nenhuma.

command -v cloud-sql-proxy >/dev/null 2>&1 || {
  echo "cloud-sql-proxy não encontrado. Instale com: brew install cloud-sql-proxy" >&2
  exit 1
}

CONN="$(sql_connection_name)"
[[ -n "$CONN" ]] || { echo "Cloud SQL não existe ainda — rode 25-cloudsql.sh antes." >&2; exit 1; }

PORT=15432
PASS="$(gcloud secrets versions access latest --secret DATABASE_PASSWORD --project "$PROJECT_ID")"

cloud-sql-proxy --port "$PORT" "$CONN" &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT

# O proxy leva alguns segundos para aceitar conexão. Sem a espera, o primeiro
# `prisma migrate deploy` falha com ECONNREFUSED e parece erro de credencial.
for _ in $(seq 1 30); do
  nc -z 127.0.0.1 "$PORT" 2>/dev/null && break
  sleep 1
done
nc -z 127.0.0.1 "$PORT" 2>/dev/null || { echo "proxy não subiu na porta $PORT." >&2; exit 1; }

export DATABASE_URL="postgresql://${SQL_USER}:${PASS}@127.0.0.1:${PORT}/${SQL_DB}"

cd "$(dirname "$0")/../.."

echo "→ prisma migrate deploy"
pnpm exec prisma migrate deploy

# Defaults do sistema: usuário do painel, o singleton de settings e a régua
# padrão com os 6 passos. Idempotente — não sobrescreve senha de usuário
# existente nem passo de régua já editado.
if [[ -n "${SEED_USER_EMAIL:-}" && -n "${SEED_USER_PASSWORD:-}" ]]; then
  echo "→ seed (usuário · settings · régua padrão)"
  pnpm exec tsx prisma/seed.ts
else
  echo
  echo "seed pulado. Para criar o login e os defaults:"
  echo "  SEED_USER_EMAIL=... SEED_USER_PASSWORD=... $0"
fi
