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

# DATABASE_URL não sai daqui: quem cria o banco é 25-cloudsql.sh, e é ele que
# grava a connection string e a senha.

for s in "${SECRETS[@]}"; do
  # DATABASE_URL ainda não existe na primeira passada — 25-cloudsql.sh libera a
  # leitura dele junto com a criação.
  exists "$s" || continue
  gcloud secrets add-iam-policy-binding "$s" \
    --member "serviceAccount:${RUNTIME_EMAIL}" \
    --role roles/secretmanager.secretAccessor \
    --project "$PROJECT_ID" >/dev/null
done

echo "Leitura liberada para ${RUNTIME_EMAIL}."
echo "Próximo: 25-cloudsql.sh (cria o banco e a DATABASE_URL)."
