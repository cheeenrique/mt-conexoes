# Evolution API — canal de WhatsApp não oficial

Stack Docker para o provider `EVOLUTION` do painel (`ChannelConfig.provider = 'EVOLUTION'`,
adapter em `src/features/messaging/channels/evolution/`). Roda numa VPS própria — nunca no
Cloud Run do painel. Ver `CLAUDE.md` §"Duas aplicações" e §"Providers de WhatsApp",
e `docs/projeto/tecnico/06-regua-e-canais.md` §"Evolution exige servidor do cliente".

## Por que não é Cloud Run

O Evolution mantém a sessão do WhatsApp (Baileys) num processo persistente. Cloud Run escala
a zero e troca de instância a qualquer momento — a sessão morreria e o operador teria que
reparear lendo QR de novo a cada cold start. Precisa de VM/VPS com Docker, ligada o tempo todo.

## Versão fixada — 2.3.7

**Imagem: `evoapicloud/evolution-api:v2.3.7`.** Nunca `latest`.

- `evoapicloud` é o registro Docker Hub atual do projeto (o antigo `atendai/evolution-api`
  parou em `v2.2.3`; o código-fonte também migrou de `EvolutionAPI/evolution-api` para
  `evolution-foundation/evolution-api` no GitHub, mas a tag `2.3.7` existe nos dois).
- `2.3.7` é a última tag **estável** (não `-rc`) da série 2.x no momento desta entrega
  (2026-08-22). A série 2.4 só tem `2.4.0-rc1`/`rc2` publicados — release candidate não é
  produção pra um canal que, se cair, some com a cobrança do mês.
- **Foi exatamente essa a incógnita que bloqueou a análise anterior**: o formato do `webhook`
  em `POST /instance/create` mudou entre 1.x e 2.x. Fixando `2.3.7` e conferindo contra o
  código-fonte dessa tag (não a doc genérica, nem o `main`), o formato é:
  ```json
  "webhook": { "enabled": true, "url": "...", "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"], "headers": { "apikey": "..." } }
  ```
  igual ao que o adapter do painel já espera.

### Conferir a versão em runtime

```bash
curl -s https://evolution.seudominio.com.br/ | jq .
```

Devolve, sem precisar de `apikey` (rota pública, confirmado no código — `GET /` não tem guard
de autenticação):

```json
{
  "status": 200,
  "message": "Welcome to the Evolution API, it is working!",
  "version": "2.3.7",
  "clientName": "mt_conexoes_evolution",
  "documentation": "https://doc.evolution-api.com",
  "whatsappWebVersion": "2.3000.1043857760"
}
```

`version` diferente de `2.3.7` depois de um `docker compose pull` sem querer (ex.: alguém
trocou a tag) é o sinal de que a stack está rodando uma versão não verificada.

## Requisitos de máquina

Escala do projeto: **uma** instância WhatsApp (um número), até ~1.000 assinantes recebendo
régua de cobrança — não 1.000 sessões simultâneas. Carga é baixa: envio limitado a
`rateLimitPerMinute: 20` no adapter do painel, inbound ocasional (respostas dos clientes).

| Recurso | Recomendado | Por quê |
|---|---|---|
| vCPU | 2 | Node (Evolution) + Postgres + Redis + ffmpeg (mídia) + Caddy dividindo a mesma máquina |
| RAM | 4 GB | Baileys mantém estado de conexão em memória; processamento de mídia (áudio/imagem) pode picar |
| Disco | 20 GB SSD | Postgres cresce com histórico de mensagem (`DATABASE_SAVE_DATA_NEW_MESSAGE=true` por padrão da imagem) |
| SO | Ubuntu 22.04/24.04 LTS ou Debian 12 | Suporte longo, `apt` com patch de segurança automático (ver "Segurança") |

### Máquina de 1 GB (GCP e2-micro)

Cabe, com `docker-compose.micro.yml` por cima do compose base:

```bash
docker compose -f docker-compose.yml -f docker-compose.micro.yml up -d
```

O override capa o heap do V8 em 384 MB, aperta `shared_buffers` do Postgres
para 64 MB, põe teto e política de descarte no Redis e desliga
`DATABASE_SAVE_DATA_NEW_MESSAGE` — o painel já guarda a mensagem dele em
`messages`, o histórico daqui é cópia que só faz o disco crescer.

Consumo em repouso, medido por soma de RSS típico e não pelo limite declarado:
SO ~150 MB · Node ~450 · Postgres ~80 · Redis ~12 · Caddy ~20 ≈ **710 MB**.
A VM provisionada por `scripts/gcp/60-evolution-vm.sh` sobe com 2 GB de swap e
`vm.swappiness=10` para absorver o pico do Baileys sem OOM kill.

⚠️ `DATABASE_SAVE_DATA_INSTANCE` continua `true`. É ele que mantém a credencial
de sessão no Postgres — com ela gravada, um restart (inclusive depois de um OOM
kill) reconecta sozinho, **sem QR novo**. É o que torna a e2-micro um risco de
minutos de atraso, não de reparear com o celular do cliente na mão.

Em máquina de 2 GB+ não usar o override: os tetos só atrapalham.

Isto é dimensionamento honesto, não testado sob carga real — não há VPS de homologação
disponível nesta entrega. Se o WhatsApp do cliente tiver volume de mensagem alto (grupos,
mídia pesada), reavaliar depois de medir.

## Subida passo a passo

### 0. Endereço deste projeto

`EVOLUTION_DOMAIN=evolution.mtconexoes.com.br`, registro A **cinza (DNS only)**
no Cloudflare apontando para o IP fixo da VM. Com o proxy laranja ligado, o
Caddy não fecha o desafio do Let's Encrypt e fica tentando em silêncio.

O painel fica na URL `*.run.app` — Cloud Run não faz domínio custom em
`southamerica-east1`. Ver `docs/deploy.md` §6.

### 1. Provisionar a VPS

- Ubuntu 22.04/24.04 LTS, 2 vCPU / 4 GB, disco 20 GB+.
- DNS: `EVOLUTION_DOMAIN` (ex.: `evolution.cliente.com.br`) apontando pro IP da VPS **antes**
  de subir o Caddy — ele pede o certificado Let's Encrypt na primeira request.
- Portas liberadas no firewall do provedor **e** no firewall do host: só 22 (SSH), 80, 443.
- Docker + Docker Compose v2 instalados (`docker compose version` ≥ v2).

### 2. Clonar e configurar

```bash
git clone <este-repositório> && cd mt-conexoes/infra/evolution
cp .env.example .env
```

Editar `.env`:

```bash
# Chave da Evolution — a fronteira de segurança inteira do canal
openssl rand -hex 32        # → AUTHENTICATION_API_KEY

# Senhas de banco e cache
openssl rand -base64 32     # → POSTGRES_PASSWORD
openssl rand -base64 32     # → REDIS_PASSWORD
```

Preencher `EVOLUTION_DOMAIN`, `CADDY_EMAIL`, `SERVER_URL` (mesmo domínio, com `https://`).

### 3. Subir a stack

```bash
docker compose up -d
docker compose ps          # todos "healthy" em ~1 min (Postgres roda migration na subida)
curl -s https://$EVOLUTION_DOMAIN/ | jq .version   # "2.3.7"
```

### 4. Criar a instância que o painel vai usar

⚠️ **Este passo virou opcional.** O painel hoje cria a instância e mostra o QR sozinho:
Ajustes › Canais › Evolution API › "Ler o QR Code aqui". Ele monta exatamente o `create`
abaixo — mesmos `groupsIgnore`/`rejectCall`/`syncFullHistory`, mesmo `webhook.headers.apikey`
— com `instanceName` e `webhookToken` gerados por ele. O `curl` continua aqui como referência
do que o painel faz e para quem quiser conectar por fora e usar o caminho "Já tenho uma
instância pareada".

```bash
curl -s -X POST https://$EVOLUTION_DOMAIN/instance/create \
  -H "apikey: <AUTHENTICATION_API_KEY do .env>" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "mt-conexoes",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true,
    "groupsIgnore": true,
    "rejectCall": true,
    "syncFullHistory": false,
    "webhook": {
      "enabled": true,
      "url": "https://painel.seudominio.com.br/api/webhooks/evolution",
      "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      "headers": { "apikey": "<webhookToken que você escolher — mesmo valor da tela de canal do painel>" }
    }
  }'
```

Cada campo confirmado contra o código-fonte da tag `2.3.7`
(`src/api/controllers/instance.controller.ts`, `src/api/dto/instance.dto.ts`):

- **`webhook.headers`** é o que faz o `apikey` chegar como **header HTTP** na requisição que a
  Evolution manda pro painel (`axios.create({ headers: instance.headers })` em
  `webhook.controller.ts`). Sem isso, `POST /api/webhooks/evolution` devolve 401 e o opt-out
  (`PARE`/`SAIR`/...) nunca chega — a trava **T5** fica desligada em silêncio. O valor tem que
  bater exatamente com o `webhookToken` cadastrado na tela de canal do painel: o adapter lê
  `headers.get('apikey')` (`src/features/messaging/channels/evolution/adapter.ts`).
- **`groupsIgnore: true` e `rejectCall: true`** — default é `false` nos dois
  (`instance.controller.ts:126-128`, confirmado rodando a stack local: sem esses campos, a
  resposta de `settings` volta com `false`). Sem eles, o número de cobrança recebe ligação e
  pode ser adicionado a grupo.
- **`syncFullHistory: false`** — `true` puxaria o histórico inteiro de conversas do número pra
  dentro da máquina no momento do pareamento. Confirmado como o mesmo default (`false`) na
  tag fixada.
- **`qrcode: true`** retorna o QR code (base64) já na resposta do `create`, sem precisar de
  chamada extra — ler o campo `qrcode` do JSON de resposta e exibir pra escanear com o
  WhatsApp do número que vai enviar.

Se `qrcode` não vier na resposta (ex.: passou tempo demais), buscar de novo com:

```bash
curl -s https://$EVOLUTION_DOMAIN/instance/connect/mt-conexoes \
  -H "apikey: <AUTHENTICATION_API_KEY>" | jq .
```

### 5. Conferir a conexão

```bash
curl -s https://$EVOLUTION_DOMAIN/instance/connectionState/mt-conexoes \
  -H "apikey: <AUTHENTICATION_API_KEY>" | jq .
# { "instance": { "instanceName": "mt-conexoes", "state": "open" } }
```

`state: "open"` é o mesmo valor que `adapter.healthCheck()` do painel confere.

## Como o painel se conecta

Na tela de canal (`ChannelConfig`, provider `EVOLUTION`), preencher com os valores desta VPS:

| Campo na tela do painel | Valor |
|---|---|
| Endereço da instância (`baseUrl`) | `https://evolution.seudominio.com.br` (sem barra no fim) |
| Nome da instância (`instanceName`) | `mt-conexoes` (o que você usou no passo 4) |
| Chave de API (`apiKey`) | o `AUTHENTICATION_API_KEY` do `.env` desta VPS |
| Token do webhook (`webhookToken`) | o mesmo valor usado em `webhook.headers.apikey` no passo 4 — escolha você, não vem da Evolution |

Confirmado contra `src/features/messaging/channels/evolution/schema.ts` e `descriptor.ts` —
são exatamente esses quatro campos, nada a mais.

### O que o painel observou rodando esta stack

- `POST /instance/create` **pode voltar sem o QR** (`qrcode: { count: 0 }`): ele é montado
  quando o Baileys emite o evento, não na resposta. Medido aqui: `create` levou 6,1s e o QR só
  apareceu em `GET /instance/connect` ~6,7s depois. Por isso o painel espera o QR ficar pronto
  antes de abrir o diálogo.
- `pairingCode` (8 caracteres, alternativa ao QR) só existe se a instância foi criada com
  `number`. O painel pede o número que vai enviar exatamente por isso.
- O `hash` da resposta do `create` é o token **interno** da instância — é o `apikey` que vem no
  **corpo** de todo evento. Não é o `webhookToken`; só o header é conferido pelo painel.
- Erro da Evolution vem em `response.message`, que é **string ou lista de strings** (nome de
  instância repetido volta como `["This name ... is already in use."]`).

## Backup e restore

### ⚠️ Divergência encontrada com o que era esperado — leia antes de planejar backup

A tarefa original presumia que a credencial de sessão do WhatsApp mora num **volume de
arquivo** (`/evolution/instances`), e que perder esse volume derruba todas as sessões. Conferindo
o código-fonte da 2.3.7 (`whatsapp.baileys.service.ts`, método `defineAuthState()`), isso **não
é verdade nesta configuração**:

```ts
if (provider?.ENABLED) return authStateProvider(...)              // desligado nesta stack
if (cache.REDIS.ENABLED && cache.REDIS.SAVE_INSTANCES) return useMultiFileAuthStateRedisDb(...) // SAVE_INSTANCES=false nesta stack
if (db.SAVE_DATA.INSTANCE) return useMultiFileAuthStatePrisma(...)  // ← este é o caminho ativo
```

Com `CACHE_REDIS_SAVE_INSTANCES=false` e `DATABASE_SAVE_DATA_INSTANCE=true` (os defaults desta
stack), a credencial de sessão do Baileys é salva **no Postgres**, via Prisma
(`useMultiFileAuthStatePrisma`) — não em arquivo. Busquei toda a árvore da tag `2.3.7` por
qualquer leitura/escrita em `/evolution/instances`: a única referência é um exemplo de Swarm
legado (`Docker/swarm/evolution_api_v2.yaml`), não código executado.

**Consequência prática: o volume que não pode ser perdido é `evolution_postgres_data`, não
`evolution_instances`.** O compose ainda monta `evolution_instances:/evolution/instances` (é o
comportamento do compose oficial, e cobre o caso de alguém habilitar o modo `PROVIDER_FILES` no
futuro), mas ele está **vazio/não usado** na configuração entregue — não é o que salva o
pareamento.

### Backup (Postgres — é isto que importa)

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom > backup-evolution-$(date +%Y%m%d).dump
```

Automatizar com cron do host (fora do container, pra sobreviver a `docker compose down`) e
copiar o `.dump` pra fora da VPS (outro storage) — backup que mora só na máquina que pode
falhar não é backup.

### Restore

```bash
docker compose stop evolution-api
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists < backup-evolution-YYYYMMDD.dump
docker compose start evolution-api
```

Depois de restaurar, conferir `connectionState` (passo 5) — se vier `close`, a sessão está
íntegra no banco mas o WebSocket com o WhatsApp caiu; a Evolution reconecta sozinha em segundos
sem novo QR (a credencial continua válida). Se vier erro de autenticação, a sessão real é mais
nova que o backup — precisa reparear.

## Atualização de versão sem perder sessão

1. Ler o changelog da nova tag antes de trocar — mudança de schema de webhook já aconteceu
   uma vez entre 1.x e 2.x (é o motivo desta versão estar fixada).
2. Fazer backup do Postgres (seção acima) **antes** de qualquer coisa.
3. Trocar a tag em `docker-compose.yml` (`evoapicloud/evolution-api:vX.Y.Z`) e em qualquer
   lugar que a mencione neste README.
4. `docker compose pull evolution-api && docker compose up -d evolution-api` — o entrypoint da
   imagem roda `prisma migrate deploy` sozinho na subida (visto no `ENTRYPOINT` do
   `Dockerfile`: `deploy_database.sh && npm run start:prod`), aplica migration nova do schema
   se houver.
5. Conferir `GET /` (versão) e `connectionState` (sessão continua `open`).
6. Se algo quebrar: `docker compose stop evolution-api`, restaurar o backup do passo 2,
   `docker compose up -d evolution-api` de volta na tag anterior.

## O que fazer quando a sessão cai

`state` sai de `open` para `close`/`connecting`:

1. Conferir `docker compose logs evolution-api --tail 100` — banimento do WhatsApp aparece
   como erro de auth/logout explícito, queda de rede aparece como timeout.
2. Reconexão de rede é automática — esperar 1–2 min e reconferir `connectionState`.
3. Se continuar `close` e o log mostrar `loggedOut`/`banned`: a sessão morreu de vez. Repetir o
   passo 4 de "Subida passo a passo" (novo QR) com o **mesmo** `instanceName` — o histórico e a
   configuração de webhook continuam no Postgres, só a credencial de sessão é nova.
4. Se for banimento do número: ver `docs/projeto/tecnico/06-regua-e-canais.md` §"Evolution
   exige servidor do cliente" — é risco aceito e registrado na entrega, não bug desta stack.
   Número novo, reparear, todo cliente passa a receber cobrança de um contato "desconhecido"
   no WhatsApp até salvar o novo número.

## Segurança

⚠️ **`AUTHENTICATION_API_KEY` é toda a segurança do canal.** Quem tiver essa chave e a URL
manda mensagem pelo WhatsApp do cliente, número não-oficial sem reversão se banido.

- Chave gerada com `openssl rand -hex 32`, nunca o valor de exemplo do `.env.example` oficial
  da Evolution (`429683C4C977415CAAFCCE10F7D57E11` — é público, está no GitHub deles, robô
  varre repositório público atrás desse valor exato).
- **Só 80 e 443 públicos.** `docker-compose.yml` não publica porta nenhuma de Postgres ou
  Redis (`ports:` ausente nesses dois serviços — só `expose` interno da rede do compose).
  Conferir também o firewall do host (`ufw status` deve mostrar só 22/80/443).
- **Evolution Manager (UI web) fica desligada** (`SERVER_DISABLE_MANAGER=true`), confirmado
  rodando a stack local: `GET /manager` devolve 404. Se precisar ligar temporariamente pra
  depurar um pareamento pela UI:
  1. `SERVER_DISABLE_MANAGER=false` no `.env`, `docker compose up -d evolution-api`.
  2. Proteger o acesso com basicauth no Caddy **enquanto estiver ligado** — adicionar no
     `Caddyfile`, dentro do bloco do domínio:
     ```
     handle_path /manager* {
         basicauth {
             operador $2a$14$<hash gerado com: docker run --rm caddy:2.9.1-alpine caddy hash-password>
         }
         reverse_proxy evolution-api:8080
     }
     ```
  3. Terminado o uso: reverter os dois passos. Não deixar o Manager acessível depois de
     resolver o problema — é a UI que expõe QR code e estado de todas as instâncias.
- Nada de credencial em log: `LOG_LEVEL` do `.env.example` **não** inclui `WEBHOOKS` de
  propósito — essa flag faz a Evolution logar o corpo de cada webhook, e o webhook de inbound
  carrega o texto que o assinante escreveu.
- Firewall do host: `ufw allow 22,80,443/tcp` + `ufw enable` (ou equivalente do provedor). Sem
  isso, Postgres/Redis expostos só pela rede interna do Docker ainda dependem do firewall do
  host pra não vazar se alguém mexer no compose sem querer.
- Atualização automática de segurança do SO: `unattended-upgrades` (Ubuntu/Debian) só pra
  patches de segurança — não para o Docker/Evolution em si, que segue o processo de
  "Atualização de versão" acima, controlado.
- **Dono da máquina**: definir explicitamente quem no time (ou o próprio cliente, se ele
  provisionar) é responsável por essa VPS — patch de SO, renovação de DNS, monitorar disco
  cheio, backup rodando de verdade. Infraestrutura sem dono é o tipo de coisa que quebra seis
  meses depois sem ninguém notar até o cliente reclamar que parou de cobrar.

## O que este README não cobre

- Provisionamento da VPS em si (Terraform, cloud-init) — infraestrutura como código para a VM
  não foi pedida nesta entrega; os passos acima assumem uma VPS já provisionada manualmente.
- Monitoramento/alerting externo (uptime check, alerta de disco) — recomendado, não incluído.
