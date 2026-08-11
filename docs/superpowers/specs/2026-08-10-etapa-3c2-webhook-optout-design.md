# Etapa 3c-2 — Webhook de resposta + opt-out automático (design)

> Última spec da Etapa 3 (WhatsApp). Cobre o fluxo inbound: recebimento de resposta do
> cliente via webhook do provider, registro na timeline e opt-out automático por
> palavra-chave (T5). Fecha o critério de pronto da Etapa 3 por completo.

## Contexto

Doc de domínio: [`docs/projeto/tecnico/06-regua-e-canais.md`](../../projeto/tecnico/06-regua-e-canais.md)
(T5 — "Palavras-chave `PARE`, `SAIR`, `CANCELAR`, `DESCADASTRAR`, `STOP` marcam o
cliente automaticamente quando o canal suporta receber resposta").
`ChannelCapabilities.supportsInboundReply` já existe (Etapa 3a) — `true` para os 3
providers.

## Escopo

- 2 providers: **Meta Cloud** e **Evolution** — formato de webhook documentado
  publicamente pra ambos. **Salvy fica de fora** (mesma ressalva do adapter de envio
  na Etapa 3a: endpoint/payload não confirmado contra doc real).
- 2 métodos novos na interface `ChannelAdapter`: `verifyWebhookSignature` e
  `parseInboundWebhook` — mesmo padrão de capabilities já usado pro envio. Route
  handler fica casca.
- `MessageKind.INBOUND` e `MessageStatus.RECEIVED` novos no enum (aditivo).
- Toda resposta recebida vira uma `Message` na timeline, opt-out ou não.
- Opt-out automático por palavra-chave exata (case-insensitive, sem substring).

**Fora de escopo**: webhook do Salvy, `dunning-evaluate`/`messages-dispatch`
(Etapa 4), qualquer resposta automatizada ao cliente (o sistema só registra e marca
opt-out, não responde nada de volta).

## Schema

```prisma
enum MessageKind {
  DUNNING
  MANUAL
  TEST
  INBOUND
}

enum MessageStatus {
  PENDING
  SENT
  FAILED
  CANCELLED
  SKIPPED
  RECEIVED
}
```

Migration aditiva — `ALTER TYPE ... ADD VALUE` pros dois enums, sem tocar linhas
existentes.

Mensagem inbound grava:

```
kind: 'INBOUND'
status: 'RECEIVED'
toPhone: <telefone do cliente>       // mesmo campo usado pra outbound, aqui é "de quem"
body: <texto recebido>
scheduledFor: now                     // colunas NOT NULL sem sentido de agendamento
scheduledDate: localDateOnly(now, tz) // aqui, só timestamp de referência do recebimento
sentAt: null                          // nunca foi "enviada" por nós
channelId: <canal que recebeu>
customerId: <resolvido por toPhone>
```

⚠️ `scheduledFor`/`scheduledDate` NOT NULL forçam esse preenchimento sem significado de
agendamento pro caso inbound — mesma acomodação, documentada aqui pra não virar
confusão de quem ler o código depois.

## Interface `ChannelAdapter` — 2 métodos novos

```ts
export type InboundMessage = { fromPhone: string; text: string };

export interface ChannelAdapter {
  // ... já existentes (provider, capabilities, send, healthCheck)
  verifyWebhookSignature(rawBody: string, headers: Headers, credentials: unknown): boolean;
  parseInboundWebhook(rawBody: string): InboundMessage[] | null;
}
```

- `verifyWebhookSignature` recebe `credentials` (já decriptado pelo service, mesmo
  padrão de `send`/`healthCheck`) porque a verificação de assinatura depende do
  segredo do canal (Meta: App Secret; Evolution: token compartilhado configurado na
  instância).
- `parseInboundWebhook` devolve **array** (um payload de webhook pode trazer mais de
  uma mensagem — Meta agrupa por `entry`) ou `null` se o payload não é um evento de
  mensagem (ex.: delivery receipt, evento de status).
- **`SALVY` precisa implementar os 2 métodos pra não quebrar a interface**, mesmo sem
  uso real: `verifyWebhookSignature` retorna `false` sempre, `parseInboundWebhook`
  retorna `null` sempre — documentado com comentário "Salvy webhook fora de escopo
  desta spec".

### `META_CLOUD`

- `verifyWebhookSignature`: HMAC-SHA256 do `rawBody` com o App Secret, comparado
  (tempo constante) contra o header `X-Hub-Signature-256` (`sha256=<hex>`).
- `parseInboundWebhook`: percorre `entry[].changes[].value.messages[]`, extrai
  `from` (telefone) e `text.body`. Ignora entradas sem `messages` (ex.: `statuses`,
  delivery receipts).
- Handshake de verificação do webhook (`GET` com `hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`)
  **não é método do adapter** — é validação de configuração única (feita uma vez ao
  registrar o webhook no painel da Meta), fica direto no route handler comparando
  contra `META_WEBHOOK_VERIFY_TOKEN` do ambiente.

### `EVOLUTION`

- `verifyWebhookSignature`: compara um header custom (`apikey` ou equivalente
  configurado na instância) contra o valor salvo nas credenciais do canal — Evolution
  não assina o payload por padrão, a segurança aqui é "só quem sabe o token consegue
  chamar o endpoint". ⚠️ Igual ao adapter de envio, o formato exato do payload de
  webhook do Evolution não está 100% confirmado nesta spec — vai ser puxado da doc
  oficial na hora de implementar esse adapter específico.
- `parseInboundWebhook`: evento `messages.upsert`, extrai `data.key.remoteJid`
  (telefone) e `data.message.conversation` (texto). Ignora eventos com
  `data.key.fromMe === true` (mensagem que nós mandamos, ecoada pelo webhook).

## Route handlers

```
app/api/webhooks/meta-cloud/route.ts
app/api/webhooks/evolution/route.ts
```

Cada um:

```ts
export async function POST(req: Request) {
  const rawBody = await req.text();
  const channelRow = await db.channelConfig.findFirst({ where: { provider: 'META_CLOUD', isActive: true } });
  if (!channelRow) return new Response(null, { status: 404 });

  const adapter = resolveAdapter(channelRow.provider);
  const credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));

  if (!adapter.verifyWebhookSignature(rawBody, req.headers, credentials)) {
    return new Response(null, { status: 401 }); // sem corpo — mesma regra dos endpoints de cron
  }

  const messages = adapter.parseInboundWebhook(rawBody);
  if (!messages) return Response.json({ ok: true }); // evento irrelevante, 200 pro provider não reenviar

  for (const msg of messages) {
    await processInboundMessage({ channelId: channelRow.id, fromPhone: msg.fromPhone, text: msg.text, now: new Date() });
  }
  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  // só o handler da Meta precisa disso — handshake de verificação do webhook
  const url = new URL(req.url);
  if (url.searchParams.get('hub.verify_token') !== requireEnv('META_WEBHOOK_VERIFY_TOKEN')) {
    return new Response(null, { status: 403 });
  }
  return new Response(url.searchParams.get('hub.challenge'));
}
```

⚠️ Falha de assinatura devolve 401 **sem corpo** — mesma regra dos endpoints de cron
(nunca vaza detalhe de validação pra quem está tentando forjar a chamada).

## `features/messaging/inbound.ts`

```ts
export async function processInboundMessage(input: {
  channelId: string;
  fromPhone: string;
  text: string;
  now: Date;
}): Promise<void>
```

1. Resolve `Customer` por `fromPhone` (`@@unique([phone])`). Sem cliente encontrado →
   grava a `Message` mesmo assim? **Não** — sem `customerId` não há onde pendurar a
   timeline nem quem marcar opt-out; loga e descarta (não é erro do sistema, é
   número desconhecido mandando mensagem pro canal do negócio — fora do domínio desta
   spec, que é sobre clientes já cadastrados).
2. Grava a `Message` (`kind: INBOUND`, `status: RECEIVED`) — sempre, antes de checar
   palavra-chave, pra timeline nunca perder a mensagem mesmo que o match de opt-out
   falhe por algum motivo.
3. Normaliza o texto (`trim().toUpperCase()`, sem acento — usar a mesma abordagem
   simples de comparação exata) e compara contra a whitelist fechada `PARE | SAIR |
   CANCELAR | DESCADASTRAR | STOP`. **Match exato da mensagem inteira**, não
   substring — "não quero mais pagar" não deve disparar por conter nenhuma palavra
   da lista (nenhuma delas é substring de outra frase comum, mas a regra geral é
   sempre exata pra evitar falso positivo).
4. Se bateu: `Customer.optedOut = true`, `optedOutAt = now`, `optedOutReason =
   'Palavra-chave: <PARE|SAIR|...>'`. **Idempotente** — cliente que já está opted-out
   e manda a palavra de novo não gera erro, só confirma o estado (upsert-like, não
   grava duplicado nada além da própria `Message` já gravada no passo 2).

## Testes

- Adapter Meta Cloud: `verifyWebhookSignature` aceita assinatura HMAC correta,
  rejeita assinatura errada/ausente; `parseInboundWebhook` extrai telefone+texto de
  um payload real de exemplo (fixture), ignora payload de `statuses`.
- Adapter Evolution: mesma cobertura, adaptada ao formato do payload confirmado na
  implementação.
- Adapter Salvy: os 2 métodos novos sempre recusam/retornam null (não quebra a
  interface, documentado como fora de escopo).
- `processInboundMessage` (integration, Postgres real):
  - mensagem de cliente conhecido sem palavra-chave: grava `Message` `RECEIVED`,
    `Customer.optedOut` continua `false`
  - mensagem "PARE" (e variações de caixa/espaço: " pare ", "Pare"): marca opt-out,
    grava `Message`
  - mensagem que contém "pare" como substring de outra palavra não dispara opt-out
  - cliente já opted-out manda "SAIR" de novo: não quebra, não duplica nada além da
    nova `Message`
  - telefone sem `Customer` correspondente: não grava `Message`, não lança erro
- Route handler: assinatura inválida devolve 401 sem corpo; sem canal ativo pro
  provider devolve 404; handshake GET da Meta responde `hub.challenge` só com token
  correto.

## Critério de pronto

Cliente responde "PARE" num número de teste real, o webhook do provider chama o
endpoint, a assinatura é validada, `Customer.optedOut` vira `true`, e a mensagem
aparece na timeline da ficha do cliente. Resposta sem palavra-chave só aparece na
timeline, sem mexer no opt-out. Requisição forjada (assinatura errada) recebe 401 e
não altera nada.

Com isso, a **Etapa 3 fecha por completo**: fundação de canal, régua com templates,
envio manual, e agora o fluxo de resposta/opt-out.
