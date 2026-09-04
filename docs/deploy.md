# Subir o painel para produção

Passo a passo do zero ao ar. Ordem importa: cada passo depende do anterior.
Os scripts de `scripts/gcp/` são idempotentes — rodar de novo não duplica nada.

Estado hoje (01/09/2026): projeto `mt-conexoes` ATIVO, conta de faturamento
`0131C0-18BABD-B7B8ED` **aberta** e **ainda não vinculada** ao projeto. Nada
provisionado.

---

## 0 · Antes de tocar em nuvem

```bash
gcloud config configurations activate mt-conexoes
gcloud config get-value project          # tem que imprimir: mt-conexoes
git status --short                        # limpo — 30-deploy.sh tagueia a imagem com o SHA
pnpm typecheck && pnpm lint && pnpm test  # o que vai ao ar é o que passou
```

⚠️ Existem 4 configurações de `gcloud` nesta máquina. Deploy com a errada ativa
publica o painel dentro de outro projeto. Todo script aborta se a ativa não for
`mt-conexoes` — não desligar essa checagem.

## 1 · Banco no Neon

Nenhum script cria isso. Projeto **`noisy-paper-64529542`**, branch
`production`.

1. Copiar a connection string do endpoint **pooled** (a que tem `-pooler` no
   host).
2. Acrescentar o limite de conexão explícito:

```
postgresql://USER:SENHA@HOST-pooler.REGIAO.aws.neon.tech/DB?sslmode=require&connection_limit=3&pool_timeout=20
```

⚠️ Sem `connection_limit`, o Prisma abre `nº de CPUs × 2 + 1` por instância e o
Cloud Run escala até 3 — o teto do plano free estoura e o painel começa a dar
erro de conexão sob carga. `3` é folgado para o volume deste cliente.

⚠️ **Horas de computação.** O plano free do Neon dá ~192 h/mês e suspende o
banco após ~5 min ocioso. O cron `messages-dispatch` roda a cada 15 min das 8h
às 19h — 48 despertares por dia, cada um segurando o banco acordado pelo mínimo:
~4 h/dia, ~120 h/mês, antes de qualquer uso da tela. Cabe, mas com pouca folga.
Se apertar, passar o job para `*/30` corta pela metade (`50-scheduler.sh`).

## 2 · Vincular faturamento

```bash
gcloud billing projects link mt-conexoes --billing-account=0131C0-18BABD-B7B8ED
gcloud billing projects describe mt-conexoes   # billingEnabled: true
```

Sem isso o passo 3 falha com uma mensagem que não diz que o problema é
faturamento.

## 3 · Provisionar (na ordem)

```bash
./scripts/gcp/00-enable-apis.sh        # run · artifactregistry · cloudbuild · scheduler · secretmanager
./scripts/gcp/10-service-accounts.sh   # painel-runtime · cron-invoker
./scripts/gcp/20-secrets.sh            # gera 4 segredos; pede a URL do Neon (colar, sem eco)
./scripts/gcp/30-deploy.sh             # build no Cloud Build + deploy + APP_URL/CRON_OIDC_AUDIENCE
SEED_USER_EMAIL="cliente@exemplo.com" SEED_USER_PASSWORD='<senha forte>' \
  ./scripts/gcp/40-migrate.sh          # migrations + defaults (usuário, settings, régua padrão)
./scripts/gcp/50-scheduler.sh          # 3 jobs de cron com OIDC
```

O que cada um cobra de atenção:

- **20** — `CREDENTIAL_KEY` nasce aqui e **nunca é rotacionada**. Versão nova
  torna ilegível toda senha de assinante e credencial de canal já gravada. Não
  existe migração automática.
- **30** — build sai no Cloud Build de propósito: o Mac é arm64, o Cloud Run é
  amd64. São duas passadas de deploy (a URL do serviço só existe depois da
  primeira, e é ela que vira `APP_URL` e `CRON_OIDC_AUDIENCE`). ~8 min.
- **40** — roda da máquina, não do container: o Neon é Postgres público sobre
  TLS, a imagem `standalone` não carrega o CLI do Prisma, e migration no boot
  faria N instâncias disputarem o lock. Além das migrations, cria os **defaults**: usuário
  do painel, singleton de `settings` e a régua padrão com 6 passos. A senha do
  seed vai no comando; trocar depois em `/conta` sobrevive a novos seeds.
- **50** — os 3 jobs ocupam o plano free inteiro. Não sobra slot para o `ping`.

## 4 · Conferir que está de pé

```bash
URL=$(gcloud run services describe painel --region southamerica-east1 --format='value(status.url)')
curl -fsS "$URL/api/health"                      # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/api/cron/dunning-evaluate"   # 401 (sem OIDC — é o esperado)
gcloud scheduler jobs run dunning-evaluate --location southamerica-east1            # exercita o caminho OIDC de verdade
gcloud run services logs read painel --region southamerica-east1 --limit 50
```

`401` no `curl` direto e `200` no job disparado pelo Scheduler é a prova de que
o OIDC está encanado. Se o job der 401, `CRON_OIDC_AUDIENCE` não bate com
`--oidc-token-audience` — os dois têm que ser a URL exata do serviço.

Login no `$URL` com o e-mail e senha do passo 40.

## 5 · Configurar o painel (na UI, uma vez)

1. **Ajustes › Negócio** — fuso `America/Sao_Paulo`, janela de silêncio
   (padrão 08:00–20:00), dados do negócio.
2. **Fornecedores** e **Planos** — antes de importar, senão a planilha não tem
   onde ancorar.
3. **Clientes › Importar planilha** — 2 etapas: a prévia não grava nada; só o
   botão final grava.
4. **Ajustes › Canais** — ver `docs/whatsapp-cliente.md`. Sem canal padrão, a
   régua avalia e nada sai.
5. **Réguas** — nasce `DRAFT`; o motor só olha a padrão e só quando `ACTIVE`.
   `DRAFT → REVIEW` (calcula tudo, não envia) → `ACTIVE`.

⚠️ Ativar não dispara retroativo: `UNIQUE(chargeId, stepId)` impede reprocessar
o par. O que estava para trás fica para trás.

## 6 · Rollback

```bash
gcloud run revisions list --service painel --region southamerica-east1
gcloud run services update-traffic painel --region southamerica-east1 \
  --to-revisions REVISAO-ANTERIOR=100
```

Instantâneo, sem rebuild. Migration **não** volta com isso — reverter schema é
migration nova.

## 7 · Endereços — decidido

| O quê | Onde | Por quê |
|---|---|---|
| Painel | a própria URL `*.run.app` | Um operador só. Domínio bonito aqui custaria mais que o banco — ver abaixo |
| Evolution | `evolution.mtconexoes.com.br` | Registro A **cinza (DNS only)** apontando para o IP fixo da VM |
| Site de captação | `mtconexoes.com.br` (Astro, Cloudflare) | Já no ar, não se mexe |

### ⚠️ Cloud Run não faz domínio custom em `southamerica-east1`

Domain mapping existe só em `asia-east1`, `asia-northeast1`, `asia-southeast1`,
`europe-north1`, `europe-west1`, `europe-west4`, `us-central1`, `us-east1`,
`us-east4` e `us-west1`. São Paulo não está na lista, e a Google marca o recurso
como preview e não recomendado para produção.

`gcloud beta run domain-mappings create` nesta região **falha** — não tentar.

CNAME apontado pelo proxy do Cloudflare direto para o `run.app` também não
resolve: o Cloud Run recebe `Host: admin.mtconexoes.com.br`, não reconhece e
devolve 404.

Se um dia o domínio do painel virar requisito, são dois caminhos, nenhum grátis
de verdade: Load Balancer global (~US$ 18-20/mês, mais que o banco) ou um Worker
do Cloudflare fazendo proxy reverso (grátis até 100k requisições/dia, mais uma
peça entre o navegador e o painel). Trocar `APP_URL` depois exige redeploy e
reexecutar `50-scheduler.sh` — `CRON_OIDC_AUDIENCE` muda junto e os 3 jobs
passam a dar 401 calados.

### Registros a criar no Cloudflare

Um só, e é manual — não há acesso de API configurado aqui:

```
Tipo  Nome        Conteúdo              Proxy
A     evolution   <IP fixo da VM>       DNS only (nuvem cinza)
```

⚠️ **Cinza, não laranja.** Com o proxy ligado, o Caddy não fecha o desafio do
Let's Encrypt e fica tentando em silêncio, sem erro visível.

### Risco aceito

`evolution.` fica no mesmo domínio do site de captação, o que o `CLAUDE.md`
desaconselha ("sem DNS em comum"). O painel **não** fica — está na URL do Cloud
Run. Então uma suspensão do domínio derruba o canal de cobrança, não o sistema.
Recuperar é apontar outro hostname e trocar o campo "Endereço da instância" na
credencial do canal; a instância pareada e a sessão do WhatsApp continuam de pé,
sem QR novo.

## 8 · Deploy contínuo pelo GitHub Actions

Depois do primeiro deploy à mão, a esteira assume. `.github/workflows/ci.yml`
ganhou o job `deploy`: todo push em `main` que passar em lint, typecheck, testes
unitários, build e integração constrói a imagem, roda `prisma migrate deploy` e
publica no Cloud Run.

```bash
./scripts/gcp/70-github-wif.sh
```

Ele imprime dois valores para cadastrar em **Settings › Secrets and variables ›
Actions › Variables** do repositório (são *variables*, não *secrets* — não há
segredo neles):

```
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_SERVICE_ACCOUNT
```

E dois *secrets*, opcionais, que só existem para o seed dos defaults:
`SEED_USER_EMAIL` e `SEED_USER_PASSWORD`. Sem eles o passo de seed é pulado de
propósito — o seed sem senha definida gera uma aleatória e a **imprime no log**
da execução.

Decisões que estão no workflow e não são óbvias:

- **Sem chave JSON.** O runner troca o próprio token OIDC por credencial de
  curta duração. `--attribute-condition` amarra a federação a este repositório:
  sem ela, qualquer repositório do GitHub trocaria o token dele por credencial
  deste projeto.
- **Migration antes do deploy.** O código que ainda está no ar precisa aguentar
  o schema novo (expand/contract). Na ordem inversa, o código novo sobe e
  encontra tabela que não existe.
- **`main` não cancela execução em andamento.** A execução termina em
  `migrate deploy`; matar o processo no meio de uma migration deixa o banco
  pedindo intervenção à mão. Em PR, continua cancelando.
- **Build no runner, não no Cloud Build.** Minuto de runner já está pago no
  plano do GitHub; o Cloud Build cobra acima da cota diária.
- **`gcloud run deploy` só com `--image`.** Qualquer outra flag ali
  sobrescreveria em silêncio o que `30-deploy.sh` configurou.

## 9 · Canal não oficial (opcional)

Só se for usar o provider `EVOLUTION`. O painel funciona sem isso — mas hoje é
o único canal que envia de verdade.

Não vai para o Cloud Run: a Evolution mantém a sessão do WhatsApp num processo
persistente, e o Cloud Run escala a zero e troca de instância. Cada cold start
seria um QR novo para o cliente ler.

```bash
./scripts/gcp/60-evolution-vm.sh          # e2-micro em us-east1, free tier, ~US$ 3/mês
EVOLUTION_ZONE=southamerica-east1-a ./scripts/gcp/60-evolution-vm.sh   # São Paulo, ~US$ 16/mês
```

⚠️ O free tier do Compute só existe em `us-west1`, `us-central1` e `us-east1`,
e só com disco `pd-standard` — o script escolhe o tipo de disco sozinho a partir
da zona. A credencial de sessão e os contatos dos assinantes passariam a morar
fora do Brasil: transferência internacional é permitida com salvaguarda, e o
cliente decidiu por `us-east1` em 02/09/2026, ciente disso. O painel e o banco
continuam em São Paulo.

Depois da VM: registro A de `evolution.mtconexoes.com.br` no IP fixo, **cinza**
(ver §7) → copiar `infra/evolution/` para a máquina → preencher `.env`
(`EVOLUTION_DOMAIN=evolution.mtconexoes.com.br`, `AUTHENTICATION_API_KEY` com
`openssl rand -hex 32`) → subir com o override de máquina pequena:

```bash
docker compose -f docker-compose.yml -f docker-compose.micro.yml up -d
```

O `.micro.yml` existe porque a e2-micro tem 1 GB: capa o heap do Node em 384 MB,
aperta o Postgres e desliga o histórico de mensagem da Evolution (o painel já
guarda o dele). Em máquina de 2 GB+ não usar.

Se levar OOM na prática, subir de máquina não reinstala nada — `stop`,
`set-machine-type e2-small`, `start`.

⚠️ **Depois de subir a VM, configurar o painel também.** `EVOLUTION_BASE_URL`
(`https://evolution.mtconexoes.com.br`) e `EVOLUTION_API_KEY` (o mesmo valor de
`AUTHENTICATION_API_KEY` do `.env` acima) viram env vars do Cloud Run do
painel — é o que deixa o operador conectar o canal digitando só o número do
WhatsApp, sem saber o que é "endereço da instância". Sem essas duas, o botão
"Ler o QR Code aqui" falha com um erro claro (`EVOLUTION_BASE_URL não
definido`), não silenciosamente.

## O que este passo a passo NÃO cobre

- **Site de captação (Astro/Cloudflare Pages)** — repositório, domínio e conta
  separados de propósito. Ver `docs/projeto/tecnico/08-site.md`.
- **Envio pela Meta Cloud API.** O canal é configurável e o adapter monta o
  POST, mas **nada preenche `templateRef` no despacho** — `send()` recusa todo
  envio com "Passo sem template aprovado". Marcar `META_CLOUD` como padrão hoje
  é ficar sem envio. O caminho que envia hoje é `EVOLUTION` — passo 8.
- **`LEADS_ALLOWED_ORIGINS` e `TURNSTILE_SECRET_KEY`** ficam vazias até o site
  ter domínio. CORS de `/api/leads` segue `*` nesse meio-tempo.

---

## Custo mensal estimado

| Item | ~US$/mês |
|---|---|
| Banco — Neon, plano free | 0 |
| VM `e2-micro` da Evolution em `us-east1` (free tier — paga só o IPv4) | 3 |
| Cloud Run | 0–2 · escala a zero, cota gratuita cobre este volume |
| Artifact Registry | <1 |
| Cloud Scheduler | 0 · 3 jobs, dentro da cota |
| **Total** | **~US$ 4** com canal não oficial, **~US$ 1** sem |

Ordem de grandeza, não orçamento — conferir no calculador antes de prometer
número ao cliente. O que pode virar custo sem aviso é o Neon: passar das ~192 h
de computação do plano free suspende o banco até o mês virar, ou obriga a subir
de plano (~US$ 19/mês).

Onde ainda dá para cortar, com o que se perde:

- Já aplicado: VM da Evolution no free tier de `us-east1` em vez de São Paulo
  (~US$ 13/mês economizados), ao custo de sessão e contatos de assinantes
  brasileiros morarem fora do país.
- Antigas versões de imagem no Artifact Registry acumulam. Uma política de
  limpeza mantendo as 5 últimas resolve, e são centavos.
