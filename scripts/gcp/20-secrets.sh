#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project

RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

exists() { gcloud secrets describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1; }

add_version() {
  printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=- --project "$PROJECT_ID" >/dev/null
}

create_random() {
  local name="$1"
  if exists "$name"; then
    echo "· $name já existe — mantido."
    return
  fi
  gcloud secrets create "$name" --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
  add_version "$name" "$(openssl rand -base64 32)"
  echo "· $name criado."
}

# ⚠️ CREDENTIAL_KEY é a chave AES-256-GCM da senha de acesso do assinante e das
# credenciais de canal. Gerar uma segunda versão torna TODO o dado já gravado
# ilegível — não existe migração automática. Por isso este script só cria, nunca
# rotaciona. Troca de chave é procedimento à parte, com redecriptação em massa.
create_random CREDENTIAL_KEY
create_random SESSION_SECRET
create_random CRON_SECRET
create_random META_WEBHOOK_VERIFY_TOKEN

# DATABASE_URL vem do Neon e não dá para gerar aqui. Lido do terminal, sem eco,
# para não ficar no histórico do shell.
if exists DATABASE_URL; then
  echo "· DATABASE_URL já existe — mantido. Para trocar de banco, adicione uma"
  echo "  versão nova à mão: gcloud secrets versions add DATABASE_URL --data-file=-"
else
  echo
  echo "Cole a connection string do Neon (com ?connection_limit=<n>; o plano free"
  echo "do Neon tem teto baixo de conexões e o pool do Prisma derruba o banco sem isso):"
  read -rs neon_url
  [[ -n "$neon_url" ]] || { echo "vazio — abortado." >&2; exit 1; }
  gcloud secrets create DATABASE_URL --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
  add_version DATABASE_URL "$neon_url"
  echo "· DATABASE_URL criado."
fi

for s in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member "serviceAccount:${RUNTIME_EMAIL}" \
    --role roles/secretmanager.secretAccessor \
    --project "$PROJECT_ID" >/dev/null
done

echo "Leitura liberada para ${RUNTIME_EMAIL}."
