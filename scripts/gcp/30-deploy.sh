#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project
assert_billing

RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE_HOST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
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
  --set-secrets "$SECRET_FLAGS"

URL="$(service_url)"
[[ -n "$URL" ]] || { echo "não consegui ler a URL do serviço." >&2; exit 1; }

# Segunda passada. APP_URL alimenta a URL de webhook que o pareamento por QR
# entrega à Evolution; CRON_OIDC_AUDIENCE tem que bater exatamente com o
# --oidc-token-audience dos jobs (50-scheduler.sh) ou os três crons dão 401.
# EVOLUTION_BASE_URL é pra onde o painel manda a requisição de pareamento —
# junto com o segredo EVOLUTION_API_KEY (20-secrets.sh), é o que deixa o
# operador conectar o canal digitando só o número do WhatsApp.
gcloud run services update "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" \
  --update-env-vars "APP_URL=${URL},CRON_OIDC_AUDIENCE=${URL},EVOLUTION_BASE_URL=https://${EVOLUTION_DOMAIN}"

echo
echo "no ar: $URL"
echo "imagem: $IMAGE"
echo
echo "⚠️ O painel fica nesta URL de propósito — Cloud Run não faz domínio custom"
echo "   em southamerica-east1 (ver docs/deploy.md §6). Se um dia mudar, APP_URL e"
echo "   CRON_OIDC_AUDIENCE mudam junto, e os 3 jobs do Scheduler também."
