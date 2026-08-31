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
| `20-secrets.sh` | 5 segredos no Secret Manager + leitura para o runtime | sim |
| `30-deploy.sh` | repo no Artifact Registry, build, deploy, `APP_URL`/`CRON_OIDC_AUDIENCE` | sim |
| `40-migrate.sh` | `prisma migrate deploy` contra o Neon, e o primeiro usuário | não |
| `50-scheduler.sh` | `run.invoker` + os 3 jobs de cron com OIDC | sim |

## Antes de começar

Duas coisas que script nenhum resolve:

1. **Conta de faturamento aberta, vinculada ao projeto.** A que existe hoje
   (`0131C0-18BABD-B7B8ED`, BRL) está com `open: false` — conta fechada não
   pode ser vinculada. Reabrir ou criar outra é no console, com meio de
   pagamento válido. Sem isso, `00` para na hora com a mensagem certa.
2. **Banco no Neon.** Criar o projeto e ter a connection string em mãos, já com
   `?connection_limit=<n>` — o plano free tem teto baixo de conexões e o pool do
   Prisma derruba o banco sem esse limite explícito.

## Depois

- `40-migrate.sh` roda as migrations **da máquina**, não de dentro do Cloud Run:
  o Neon é Postgres público sobre TLS, a imagem `standalone` não carrega o CLI do
  Prisma, e migration no boot faria N instâncias disputarem o mesmo lock.
- Trocar a URL do Cloud Run por domínio próprio exige redeploy: `APP_URL` e
  `CRON_OIDC_AUDIENCE` mudam junto, e os 3 jobs do Scheduler também.
- `CREDENTIAL_KEY` é criada uma vez e nunca rotacionada por estes scripts. Uma
  versão nova torna ilegível toda senha de assinante e credencial de canal já
  gravada — não há migração automática.
