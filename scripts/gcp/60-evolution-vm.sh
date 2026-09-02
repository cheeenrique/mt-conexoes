#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/config.sh"
assert_project
assert_billing

# VM do canal não oficial (provider EVOLUTION). Não é o painel — o painel roda
# no Cloud Run e escala a zero; a Evolution mantém a sessão do WhatsApp num
# processo persistente e precisa de máquina ligada o tempo todo.
# Ver infra/evolution/README.md "Por que não é Cloud Run".

IP_NAME="${EVOLUTION_VM}-ip"
POLICY="${EVOLUTION_VM}-daily-snapshot"

# O free tier de Compute cobre e2-micro em us-west1/us-central1/us-east1, e só
# com disco pd-standard de até 30 GB. Criar pd-balanced numa dessas regiões
# paga o disco sem necessidade — a diferença de IOPS não se nota nesta carga.
case " us-west1 us-central1 us-east1 " in
  *" $EVOLUTION_REGION "*) DISK_TYPE="pd-standard" ;;
  *)                       DISK_TYPE="pd-balanced" ;;
esac

gcloud services enable compute.googleapis.com --project "$PROJECT_ID"

# ── IP estático ───────────────────────────────────────────────────────────
# Reservado, não efêmero: o DNS do EVOLUTION_DOMAIN aponta para ele, e IP
# efêmero muda a cada stop/start — o Caddy perderia o certificado junto.
if ! gcloud compute addresses describe "$IP_NAME" --region "$EVOLUTION_REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute addresses create "$IP_NAME" --region "$EVOLUTION_REGION" --project "$PROJECT_ID"
fi
IP="$(gcloud compute addresses describe "$IP_NAME" --region "$EVOLUTION_REGION" --project "$PROJECT_ID" --format='value(address)')"

# ── firewall ──────────────────────────────────────────────────────────────
create_rule() {
  local name="$1"; shift
  if gcloud compute firewall-rules describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "· firewall $name já existe."
  else
    gcloud compute firewall-rules create "$name" --project "$PROJECT_ID" "$@"
  fi
}

create_rule "${EVOLUTION_VM}-web" \
  --allow tcp:80,tcp:443 --target-tags "$EVOLUTION_VM" --source-ranges 0.0.0.0/0 \
  --description "Caddy: Let's Encrypt (80) e API da Evolution (443)"

# SSH só pelo túnel IAP: 35.235.240.0/20 é a faixa do Google, não a internet.
# Porta 22 aberta ao mundo em VM com chave de API de WhatsApp dentro não passa.
create_rule "${EVOLUTION_VM}-ssh-iap" \
  --allow tcp:22 --target-tags "$EVOLUTION_VM" --source-ranges 35.235.240.0/20 \
  --description "SSH somente via IAP (gcloud compute ssh --tunnel-through-iap)"

# ── VM ────────────────────────────────────────────────────────────────────
# ⚠️ --no-service-account é de propósito. Esta máquina roda um cliente não
# oficial de WhatsApp exposto na internet. Se for comprometida, não pode ter
# identidade que leia o Secret Manager do painel — CREDENTIAL_KEY e
# DATABASE_URL iriam junto.
if gcloud compute instances describe "$EVOLUTION_VM" --zone "$EVOLUTION_ZONE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "· VM $EVOLUTION_VM já existe — mantida."
else
  gcloud compute instances create "$EVOLUTION_VM" \
    --project "$PROJECT_ID" \
    --zone "$EVOLUTION_ZONE" \
    --machine-type "$EVOLUTION_MACHINE_TYPE" \
    --image-family ubuntu-2404-lts-amd64 \
    --image-project ubuntu-os-cloud \
    --boot-disk-size "${EVOLUTION_DISK_GB}GB" \
    --boot-disk-type "$DISK_TYPE" \
    --boot-disk-device-name "$EVOLUTION_VM" \
    --address "$IP" \
    --tags "$EVOLUTION_VM" \
    --no-service-account --no-scopes \
    --metadata enable-oslogin=TRUE \
    --metadata-from-file "startup-script=$(dirname "$0")/evolution-startup.sh"
fi

# ── backup do disco ───────────────────────────────────────────────────────
# A credencial de sessão do WhatsApp mora no Postgres desta VM
# (DATABASE_SAVE_DATA_INSTANCE=true). Perder o disco não é perder cache: é
# reparear por QR com o celular do cliente na mão.
if ! gcloud compute resource-policies describe "$POLICY" --region "$EVOLUTION_REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute resource-policies create snapshot-schedule "$POLICY" \
    --project "$PROJECT_ID" --region "$EVOLUTION_REGION" \
    --max-retention-days 14 --daily-schedule --start-time 06:00 \
    --on-source-disk-delete keep-auto-snapshots
fi
if ! gcloud compute disks describe "$EVOLUTION_VM" --zone "$EVOLUTION_ZONE" --project "$PROJECT_ID" \
     --format='value(resourcePolicies)' | grep -q "$POLICY"; then
  gcloud compute disks add-resource-policies "$EVOLUTION_VM" \
    --zone "$EVOLUTION_ZONE" --project "$PROJECT_ID" --resource-policies "$POLICY"
fi

cat <<TXT

VM no ar: $EVOLUTION_VM ($EVOLUTION_MACHINE_TYPE, $EVOLUTION_ZONE)
IP fixo:  $IP

Falta, fora do gcloud:

 1. DNS: apontar EVOLUTION_DOMAIN (registro A) para $IP e esperar propagar.
    O Caddy pede o certificado na primeira request — sem DNS certo ele fica
    tentando em silêncio.

 2. Entrar e subir a stack (a e2-micro exige o override .micro):

    gcloud compute ssh $EVOLUTION_VM --zone $EVOLUTION_ZONE --tunnel-through-iap
    sudo usermod -aG docker \$USER && exit    # e entrar de novo

    # copiar infra/evolution/ para a VM, preencher .env, e:
    docker compose -f docker-compose.yml -f docker-compose.micro.yml up -d

 3. Conferir a versão: curl -s https://SEU_DOMINIO/ | jq .version   → "2.3.7"

Trocar de máquina depois não reinstala nada (VM parada):
  gcloud compute instances stop $EVOLUTION_VM --zone $EVOLUTION_ZONE
  gcloud compute instances set-machine-type $EVOLUTION_VM --zone $EVOLUTION_ZONE --machine-type e2-small
  gcloud compute instances start $EVOLUTION_VM --zone $EVOLUTION_ZONE
TXT
