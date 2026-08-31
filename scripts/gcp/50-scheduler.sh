#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project
assert_billing

INVOKER_EMAIL="${INVOKER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
URL="$(service_url)"
[[ -n "$URL" ]] || { echo "serviço não existe ainda — rode 30-deploy.sh antes." >&2; exit 1; }

gcloud run services add-iam-policy-binding "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" \
  --member "serviceAccount:${INVOKER_EMAIL}" \
  --role roles/run.invoker >/dev/null

# ⚠️ O plano free do Cloud Scheduler cobre 3 jobs. Estes três ocupam todos.
# `ping` fica fora de propósito — ver docs/projeto/tecnico/01-arquitetura.md.
#
# messages-dispatch para às 19h45 e não às 20h45: a quiet hour padrão fecha às
# 20:00, e as quatro passadas da hora das 20 só encontrariam a trava T6
# reagendando. São quatro cold starts por dia sem nada para enviar.
schedule_job() {
  local name="$1" cron="$2"
  local args=(
    --location "$REGION" --project "$PROJECT_ID"
    --schedule "$cron"
    --time-zone "America/Sao_Paulo"
    --uri "${URL}/api/cron/${name}"
    --http-method POST
    --oidc-service-account-email "$INVOKER_EMAIL"
    --oidc-token-audience "$URL"
    # O padrão é 180s. Uma passada de despacho com provider lento estoura,
    # o Scheduler marca falha e retenta por cima da passada que ainda roda.
    --attempt-deadline 600s
  )
  if gcloud scheduler jobs describe "$name" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$name" "${args[@]}"
  else
    gcloud scheduler jobs create http "$name" "${args[@]}"
  fi
}

schedule_job charges-mark-overdue "0 3 * * *"
schedule_job dunning-evaluate     "0 7 * * *"
schedule_job messages-dispatch    "*/15 8-19 * * *"

echo
echo "3 jobs no ar. Encanamento (OIDC alcança o Cloud Run) sem tocar no banco:"
echo "  gcloud scheduler jobs create http ping --schedule '0 0 1 1 *' ... && gcloud scheduler jobs run ping"
echo "⚠️ isso seria o 4º job — sai do plano free. Preferir testar por dunning-evaluate."
