#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project
assert_billing

# Instância Postgres gerenciada, no menor tamanho que existe. As escolhas aqui
# são todas de custo — cada uma está comentada com o que se abre mão.

RUNTIME_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable sqladmin.googleapis.com --project "$PROJECT_ID"

exists_secret() { gcloud secrets describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1; }

# ── instância ─────────────────────────────────────────────────────────────
if gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "· instância $SQL_INSTANCE já existe — mantida."
else
  # zonal, não regional: HA dobra o preço. Este sistema tolera minutos de
  # indisponibilidade — o que ele não tolera é perder dado, e disso cuida o
  # backup diário.
  #
  # SSD e não HDD: a diferença é ~US$ 0,80/mês em 10 GB, e a f1-micro tem
  # 0,6 GB de RAM — quase nada de cache. Em HDD, toda leitura fria vira disco
  # giratório e a tela de cobranças sente.
  #
  # PITR fica desligado (padrão): guardar WAL contínuo cobra armazenamento por
  # cima do backup. Com backup diário, a perda máxima é de um dia de lançamento
  # — aceitável para um operador só. Ligar depois é `--enable-point-in-time-recovery`.
  gcloud sql instances create "$SQL_INSTANCE" \
    --project "$PROJECT_ID" \
    --database-version POSTGRES_16 \
    --edition ENTERPRISE \
    --tier "$SQL_TIER" \
    --region "$REGION" \
    --storage-type SSD \
    --storage-size "$SQL_STORAGE_GB" \
    --storage-auto-increase \
    --availability-type zonal \
    --backup-start-time 06:00 \
    --retained-backups-count 7 \
    --maintenance-window-day SUN \
    --maintenance-window-hour 7 \
    --database-flags max_connections=25
fi

CONN="$(sql_connection_name)"
[[ -n "$CONN" ]] || { echo "não consegui ler o connectionName." >&2; exit 1; }

# ── banco ─────────────────────────────────────────────────────────────────
if ! gcloud sql databases describe "$SQL_DB" --instance "$SQL_INSTANCE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud sql databases create "$SQL_DB" --instance "$SQL_INSTANCE" --project "$PROJECT_ID"
fi

# ── usuário e senha ───────────────────────────────────────────────────────
# hex, não base64: `+`, `/` e `=` precisariam de percent-encoding dentro da
# connection string, e um erro aí só aparece como falha de autenticação.
if exists_secret DATABASE_PASSWORD; then
  echo "· DATABASE_PASSWORD já existe — mantida."
  PASS="$(gcloud secrets versions access latest --secret DATABASE_PASSWORD --project "$PROJECT_ID")"
else
  PASS="$(openssl rand -hex 24)"
  gcloud secrets create DATABASE_PASSWORD --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
  printf '%s' "$PASS" | gcloud secrets versions add DATABASE_PASSWORD --data-file=- --project "$PROJECT_ID" >/dev/null
  echo "· DATABASE_PASSWORD criada."
fi

if gcloud sql users list --instance "$SQL_INSTANCE" --project "$PROJECT_ID" --format='value(name)' | grep -qx "$SQL_USER"; then
  gcloud sql users set-password "$SQL_USER" --instance "$SQL_INSTANCE" --project "$PROJECT_ID" --password "$PASS"
else
  gcloud sql users create "$SQL_USER" --instance "$SQL_INSTANCE" --project "$PROJECT_ID" --password "$PASS"
fi

# ── DATABASE_URL ──────────────────────────────────────────────────────────
# Socket unix, não TCP: o Cloud Run monta /cloudsql/<connectionName> quando o
# serviço declara --add-cloudsql-instances (30-deploy.sh). Sem porta aberta,
# sem rede autorizada, sem IP para vazar.
#
# connection_limit=3: o pool do Prisma abre (nº de CPUs × 2 + 1) por instância e
# o Cloud Run escala até 3. A f1-micro está com max_connections=25 — sem teto
# explícito, uma passada de cron junto com a tela esgota as conexões do banco.
URL="postgresql://${SQL_USER}:${PASS}@localhost/${SQL_DB}?host=/cloudsql/${CONN}&connection_limit=3&pool_timeout=20&sslmode=disable"

if ! exists_secret DATABASE_URL; then
  gcloud secrets create DATABASE_URL --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
fi
printf '%s' "$URL" | gcloud secrets versions add DATABASE_URL --data-file=- --project "$PROJECT_ID" >/dev/null

for s in DATABASE_URL DATABASE_PASSWORD; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member "serviceAccount:${RUNTIME_EMAIL}" \
    --role roles/secretmanager.secretAccessor \
    --project "$PROJECT_ID" >/dev/null
done

# Montar o socket não basta: abrir a conexão exige o papel.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${RUNTIME_EMAIL}" \
  --role roles/cloudsql.client >/dev/null

cat <<TXT

Cloud SQL pronto.
  instância: $SQL_INSTANCE ($SQL_TIER, ${SQL_STORAGE_GB} GB SSD, zonal)
  conexão:   $CONN
  backup:    diário às 06:00, 7 retidos, sem PITR

⚠️ sslmode=disable na URL é correto aqui: o tráfego não passa por rede — é
   socket unix local, e o conector do Cloud Run já cuida da criptografia.

Para cortar mais ~US\$ 0,80/mês: --storage-type HDD na criação. Não recomendado
com 0,6 GB de RAM na instância (pouco cache, toda leitura fria vai a disco).
TXT
