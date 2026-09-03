# Valores compartilhados pelos scripts de provisionamento. Não executa nada
# sozinho — cada script faz `source` deste arquivo.

PROJECT_ID="mt-conexoes"
REGION="southamerica-east1"
SERVICE="painel"
AR_REPO="painel"

RUNTIME_SA="painel-runtime"        # identidade do serviço no Cloud Run
INVOKER_SA="cron-invoker"          # identidade que o Cloud Scheduler usa

# VM do canal não oficial (60-evolution-vm.sh). Sobrescrevíveis por env var:
# EVOLUTION_ZONE=us-east1-b ./scripts/gcp/60-evolution-vm.sh  → free tier.
EVOLUTION_VM="evolution"
# us-east1 e não São Paulo: é onde o free tier de Compute cobre a e2-micro
# (~US$ 3/mês contra ~US$ 14). Decidido em 02/09/2026 com o cliente ciente de que
# a credencial de sessão do WhatsApp e os contatos dos assinantes passam a morar
# fora do Brasil. O painel e o banco continuam em southamerica-east1.
EVOLUTION_ZONE="${EVOLUTION_ZONE:-us-east1-b}"
EVOLUTION_MACHINE_TYPE="${EVOLUTION_MACHINE_TYPE:-e2-micro}"
EVOLUTION_DISK_GB="${EVOLUTION_DISK_GB:-20}"
EVOLUTION_REGION="${EVOLUTION_ZONE%-*}"

# GitHub Actions — federação de identidade (70-github-wif.sh). Sem chave JSON
# de service account: chave longa em segredo de repositório é credencial que
# não expira e vaza em fork/log.
GH_REPO="${GH_REPO:-cheeenrique/mt-conexoes}"
WIF_POOL="github"
WIF_PROVIDER="github-actions"
DEPLOYER_SA="github-deployer"

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
