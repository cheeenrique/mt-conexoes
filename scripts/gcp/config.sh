# Valores compartilhados pelos scripts de provisionamento. Não executa nada
# sozinho — cada script faz `source` deste arquivo.

PROJECT_ID="mt-conexoes"
REGION="southamerica-east1"
SERVICE="painel"
AR_REPO="painel"

RUNTIME_SA="painel-runtime"        # identidade do serviço no Cloud Run
INVOKER_SA="cron-invoker"          # identidade que o Cloud Scheduler usa

# Segredos que o serviço lê do Secret Manager. CREDENTIAL_KEY não está sozinho
# nesta lista por acaso — ver o aviso em 20-secrets.sh antes de mexer nele.
SECRETS=(DATABASE_URL SESSION_SECRET CREDENTIAL_KEY CRON_SECRET META_WEBHOOK_VERIFY_TOKEN)

# Existem quatro configurações de gcloud nesta máquina (ceia-ufg, default,
# hora-da-saida, mt-conexoes) e três contas credenciadas. Um `gcloud run deploy`
# disparado com a configuração errada ativa publica o painel do cliente dentro
# de outro projeto. Todo script confere antes de tocar em qualquer coisa.
assert_project() {
  local active
  active="$(gcloud config get-value project 2>/dev/null)"
  if [[ "$active" != "$PROJECT_ID" ]]; then
    echo "abortado: projeto ativo do gcloud é '$active', esperado '$PROJECT_ID'." >&2
    echo "rode: gcloud config configurations activate $PROJECT_ID" >&2
    exit 1
  fi
}

# Sem faturamento, `services enable` falha em run/artifactregistry/scheduler/
# secretmanager com uma mensagem que não diz que o problema é faturamento.
assert_billing() {
  local enabled
  enabled="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null)"
  if [[ "$enabled" != "True" ]]; then
    echo "abortado: faturamento desligado em '$PROJECT_ID'." >&2
    echo "vincule uma conta de faturamento aberta no console e rode de novo." >&2
    exit 1
  fi
}

project_number() {
  gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)'
}

service_url() {
  gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)' 2>/dev/null
}
