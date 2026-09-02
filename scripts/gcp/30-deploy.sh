#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project
assert_billing

RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE_HOST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"

# O socket unix da DATABASE_URL só existe se o serviço declarar a instância.
# Sem isto o painel sobe e falha em toda query, com "socket not found".
SQL_CONN="$(sql_connection_name)"
[[ -n "$SQL_CONN" ]] || { echo "Cloud SQL não existe ainda — rode 25-cloudsql.sh antes." >&2; exit 1; }
TAG="$(git rev-parse --short HEAD)"
IMAGE="${IMAGE_HOST}/${SERVICE}:${TAG}"

if ! gcloud artifacts repositories describe "$AR_REPO" \
     --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker --location "$REGION" \
    --description "Imagens do painel" --project "$PROJECT_ID"
fi

# Build no Cloud Build, não na máquina: o Mac é arm64 e o Cloud Run roda amd64.
# Cross-build local por emulação leva dezenas de minutos para um build de Next.
gcloud builds submit --tag "$IMAGE" --project "$PROJECT_ID" .

# DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,...
SECRET_FLAGS=""
for s in "${SECRETS[@]}"; do
  SECRET_FLAGS="${SECRET_FLAGS:+${SECRET_FLAGS},}${s}=${s}:latest"
done

# Primeira passada: o serviço precisa existir para ter URL, e APP_URL e
# CRON_OIDC_AUDIENCE são a própria URL. Ovo e galinha resolvido em duas passadas.
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --service-account "$RUNTIME_EMAIL" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --cpu-boost \
  --set-env-vars NODE_ENV=production \
  --set-secrets "$SECRET_FLAGS" \
  --add-cloudsql-instances "$SQL_CONN"

URL="$(service_url)"
[[ -n "$URL" ]] || { echo "não consegui ler a URL do serviço." >&2; exit 1; }

# Segunda passada. APP_URL alimenta a URL de webhook que o pareamento por QR
# entrega à Evolution; CRON_OIDC_AUDIENCE tem que bater exatamente com o
# --oidc-token-audience dos jobs (50-scheduler.sh) ou os três crons dão 401.
gcloud run services update "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" \
  --update-env-vars "APP_URL=${URL},CRON_OIDC_AUDIENCE=${URL}"

echo
echo "no ar: $URL"
echo "imagem: $IMAGE"
echo
echo "⚠️ O painel fica nesta URL de propósito — Cloud Run não faz domínio custom"
echo "   em southamerica-east1 (ver docs/deploy.md §6). Se um dia mudar, APP_URL e"
echo "   CRON_OIDC_AUDIENCE mudam junto, e os 3 jobs do Scheduler também."
