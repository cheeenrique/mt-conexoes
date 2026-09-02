#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project
assert_billing

# Deixa o GitHub Actions publicar sem chave: o runner troca o token OIDC dele
# por um token de curta duração desta service account. Nada que expire em
# "nunca" fica guardado no repositório.

DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUM="$(project_number)"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"

if ! gcloud iam service-accounts describe "$DEPLOYER_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$DEPLOYER_SA" \
    --display-name "GitHub Actions (build, deploy e migration)" --project "$PROJECT_ID"
fi

if ! gcloud iam workload-identity-pools describe "$WIF_POOL" \
     --location global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$WIF_POOL" \
    --location global --display-name "GitHub" --project "$PROJECT_ID"
fi

if ! gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
     --workload-identity-pool "$WIF_POOL" --location global --project "$PROJECT_ID" >/dev/null 2>&1; then
  # ⚠️ --attribute-condition não é opcional. Sem ela, QUALQUER repositório do
  # GitHub — de qualquer conta — consegue trocar o próprio token OIDC por
  # credencial deste projeto.
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --location global --workload-identity-pool "$WIF_POOL" \
    --display-name "GitHub Actions" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '${GH_REPO}'" \
    --project "$PROJECT_ID"
fi

POOL_PATH="projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/${WIF_POOL}"

# Só a branch main assume a identidade. Pull request de fork roda os testes,
# nunca o deploy.
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" \
  --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${POOL_PATH}/attribute.repository/${GH_REPO}" >/dev/null

grant() {
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${DEPLOYER_EMAIL}" --role "$1" >/dev/null
}

grant roles/artifactregistry.writer      # empurrar a imagem
grant roles/run.developer                # atualizar o serviço
grant roles/cloudsql.client              # proxy para rodar as migrations
grant roles/iam.serviceAccountUser       # deployar RODANDO COMO painel-runtime

# Só a senha do banco, não o resto do cofre: o CI roda migration e seed pelo
# proxy, e não tem por que ler CREDENTIAL_KEY nem SESSION_SECRET.
gcloud secrets add-iam-policy-binding DATABASE_PASSWORD \
  --member "serviceAccount:${DEPLOYER_EMAIL}" \
  --role roles/secretmanager.secretAccessor --project "$PROJECT_ID" >/dev/null

cat <<TXT

Federação pronta. Cadastrar como *variables* (não secrets — não são segredo)
em Settings › Secrets and variables › Actions › Variables do repositório
${GH_REPO}:

  GCP_WORKLOAD_IDENTITY_PROVIDER = ${POOL_PATH}/providers/${WIF_PROVIDER}
  GCP_SERVICE_ACCOUNT            = ${DEPLOYER_EMAIL}

TXT
