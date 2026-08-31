#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project

# Duas identidades separadas de propósito: quem roda o painel não precisa poder
# invocar nada, e quem dispara os crons não precisa ler segredo nenhum.
create_sa() {
  local name="$1" display="$2"
  if gcloud iam service-accounts describe "${name}@${PROJECT_ID}.iam.gserviceaccount.com" \
       --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "service account $name já existe."
  else
    gcloud iam service-accounts create "$name" \
      --display-name "$display" --project "$PROJECT_ID"
  fi
}

create_sa "$RUNTIME_SA" "Painel MT Conexões (runtime do Cloud Run)"
create_sa "$INVOKER_SA" "Cloud Scheduler (invoca os crons do painel)"

echo "Service accounts prontas. As permissões de segredo saem em 20-secrets.sh"
echo "e a de invocação em 50-scheduler.sh — cada uma junto do recurso que protege."
