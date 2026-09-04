# Provisionamento no Google Cloud

Scripts idempotentes que levam o painel do zero ao ar em `mt-conexoes`,
`southamerica-east1`. Rodar duas vezes não duplica nada — cada um confere o que
já existe antes de criar.

Todos abortam se a configuração ativa do `gcloud` não for a do projeto. Existem
quatro configurações e três contas nesta máquina; um deploy com a errada ativa
publica o painel dentro de outro projeto.

```bash
gcloud config configurations activate mt-conexoes
```

## Ordem

| Script | O que faz | Precisa de faturamento |
|---|---|---|
| `00-enable-apis.sh` | run · artifactregistry · cloudbuild · cloudscheduler · secretmanager | sim |
| `10-service-accounts.sh` | `painel-runtime` e `cron-invoker` | não |
| `20-secrets.sh` | 6 segredos no Secret Manager + leitura para o runtime | sim |
| `30-deploy.sh` | repo no Artifact Registry, build, deploy, `APP_URL`/`CRON_OIDC_AUDIENCE` | sim |
| `40-migrate.sh` | `prisma migrate deploy` contra o Neon, e os defaults do sistema | não |
| `50-scheduler.sh` | `run.invoker` + os 3 jobs de cron com OIDC | sim |
| `60-evolution-vm.sh` | VM mínima do canal não oficial: IP fixo, firewall, snapshot diário | sim |
| `70-github-wif.sh` | Federação de identidade para o GitHub Actions publicar sem chave | sim |

`60` é **opcional e independente** dos outros cinco: o painel funciona sem ele.
Só é necessário para o provider `EVOLUTION`, que precisa de máquina ligada o
tempo todo — ver `infra/evolution/README.md` "Por que não é Cloud Run". Roda
depois de `30`, porque a VM precisa da URL do painel no webhook.

⚠️ Depois de preencher o `.env` da VM (`60`), o `AUTHENTICATION_API_KEY` de lá
precisa virar o segredo `EVOLUTION_API_KEY` daqui (`20-secrets.sh` pede colado,
sem eco) — os dois valores têm que ser idênticos, senão o pareamento por QR do
painel fala com a Evolution errada.

## Antes de começar

Uma coisa que script nenhum resolve: **conta de faturamento aberta, vinculada ao
projeto.** A que existe hoje (`0131C0-18BABD-B7B8ED`, BRL) já está aberta, mas
ainda não vinculada:

```bash
gcloud billing projects link mt-conexoes --billing-account=0131C0-18BABD-B7B8ED
```

Sem isso, `00` para na hora com a mensagem certa.

E o **banco no Neon**: projeto `noisy-paper-64529542`, branch `production`, com a
connection string em mãos já com `?connection_limit=<n>` — `20-secrets.sh` pede
ela colada, sem eco.

## Depois

- `40-migrate.sh` roda as migrations **da máquina**, não de dentro do Cloud Run:
  o Neon é Postgres público sobre TLS, alcançável daqui; a imagem `standalone`
  não carrega o CLI do Prisma; e migration no boot faria N instâncias disputarem
  o mesmo lock.
- Depois do primeiro deploy à mão, `70-github-wif.sh` passa a esteira para o
  GitHub Actions: todo push em `main` que passar nos testes constrói a imagem,
  roda `migrate deploy` e publica. Ver o job `deploy` em `.github/workflows/ci.yml`.
- Trocar a URL do Cloud Run por domínio próprio exige redeploy: `APP_URL` e
  `CRON_OIDC_AUDIENCE` mudam junto, e os 3 jobs do Scheduler também.
- `CREDENTIAL_KEY` é criada uma vez e nunca rotacionada por estes scripts. Uma
  versão nova torna ilegível toda senha de assinante e credencial de canal já
  gravada — não há migração automática.
