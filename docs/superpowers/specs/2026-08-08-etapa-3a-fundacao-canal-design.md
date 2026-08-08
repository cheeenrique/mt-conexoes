# Etapa 3a — Fundação de canal (design)

> Primeira das três specs da Etapa 3 (WhatsApp). Cobre só a fundação: interface de adapter, os
> 3 adapters, o modelo `ChannelConfig` e a tela de configuração. Templates (Spec 3b) e envio
> manual + timeline + webhook de opt-out (Spec 3c) ficam para depois — nenhuma mensagem sai
> do sistema ao final desta spec.

## Contexto

Doc de domínio: [`docs/projeto/tecnico/06-regua-e-canais.md`](../../projeto/tecnico/06-regua-e-canais.md)
(seção "Adapters de canal" em diante). Modelo de dados base em
[`docs/projeto/tecnico/02-modelo-de-dados.md`](../../projeto/tecnico/02-modelo-de-dados.md#mensagens-e-canais).

Três providers de WhatsApp, um contrato único (`ChannelAdapter`). Nenhum código fora de
`features/messaging/channels/` pode saber qual provider está ativo — decide por
`capabilities`, nunca por `if (provider === 'evolution')`.

## Escopo desta spec

- Migration: `ChannelConfig` (já especificado) + coluna nova `riskAcceptedAt`
- Interface `ChannelAdapter` + `ChannelCapabilities` + registry
- 3 adapters: `META_CLOUD`, `EVOLUTION`, `SALVY`
- `features/messaging/{schema,queries,service,actions}.ts`
- Tela `/channels`: 3 cards, salvar credencial, testar conexão, ativar, marcar padrão
- Aviso de risco + aceite obrigatório para `EVOLUTION`

**Fora de escopo** (specs seguintes): editor de template, envio manual/lote, timeline de
mensagens na ficha do cliente, webhook de resposta e opt-out por palavra-chave, jobs
`dunning-evaluate`/`messages-dispatch` (Etapa 4).

## Schema

```prisma
enum ChannelProvider { META_CLOUD EVOLUTION SALVY }

model ChannelConfig {
  id             String          @id @default(uuid(7))
  provider       ChannelProvider @unique
  label          String
  isActive       Boolean         @default(false)
  isDefault      Boolean         @default(false)
  phoneNumber    String?
  credentials    String                          // JSON criptografado, AES-256-GCM (lib/crypto.ts)
  riskAcceptedAt DateTime?                        // só EVOLUTION — aceite do risco de banimento
  lastCheckAt    DateTime?
  lastCheckOk    Boolean?
  lastError      String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  messages       Message[]                        // populado a partir da Spec 3c

  @@map("channel_configs")
}
```

- **Sem seed.** A tela mostra os 3 cards a partir do enum, não do banco — "não configurado" é
  a ausência da linha. A linha nasce no primeiro `saveChannelCredentials`.
- **SQL manual na migration:** índice único parcial `channel_configs (is_default) WHERE is_default = true`
  (já listado em `03-dados.md`).
- `credentials` é um blob único por provider, não coluna por campo — forma valida por Zod
  discriminado por `provider` antes de criptografar.

Formato de `credentials` (antes de criptografar), por provider:

| Provider | Campos |
|---|---|
| `META_CLOUD` | `{ accessToken, phoneNumberId, wabaId }` |
| `EVOLUTION` | `{ baseUrl, apiKey, instanceName }` |
| `SALVY` | `{ apiKey }` — forma final confirmada na implementação, ver nota abaixo |

## Interface + capabilities

```ts
// features/messaging/channels/types.ts
export type ChannelCapabilities = {
  supportsFreeText: boolean;
  requiresApprovedTemplate: boolean;
  supportsInboundReply: boolean;
  supportsDeliveryReceipt: boolean;
  maxBodyLength: number;
  rateLimitPerMinute: number;
};

export type SendInput = {
  toPhone: string;               // E.164
  body: string;                  // já renderizado
  templateRef?: { name: string; params?: Record<string, string> };
};

export type SendResult =
  | { ok: true; externalId: string }
  | { ok: false; retryable: boolean; reason: string };

export type HealthResult =
  | { ok: true }
  | { ok: false; reason: string };

export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ChannelCapabilities;
  send(input: SendInput, credentials: unknown): Promise<SendResult>;
  healthCheck(credentials: unknown): Promise<HealthResult>;
}
```

Capabilities são código, não dado:

| | `META_CLOUD` | `EVOLUTION` | `SALVY` |
|---|---|---|---|
| `supportsFreeText` | false | true | true |
| `requiresApprovedTemplate` | true | false | false |
| `supportsInboundReply` | true | true | true |
| `supportsDeliveryReceipt` | true | true | false |
| `maxBodyLength` | 1024 | 4096 | 1000 |
| `rateLimitPerMinute` | 80 | 20 | 60 |

Salvy não confirma entrega na API pública — `supportsDeliveryReceipt: false`, `sentAt` significa
"aceito pelo provider", não "entregue ao destinatário".

Registry fecha a fronteira:

```ts
// features/messaging/channels/registry.ts
const ADAPTERS: Record<ChannelProvider, ChannelAdapter> = {
  META_CLOUD: metaCloudAdapter,
  EVOLUTION: evolutionAdapter,
  SALVY: salvyAdapter,
};
export function resolveAdapter(provider: ChannelProvider): ChannelAdapter {
  return ADAPTERS[provider];
}
```

`credentials: unknown` em `send`/`healthCheck` — cada adapter faz seu próprio `parse` com o
Zod schema do provider e lança `DomainError('CHANNEL_CREDENTIALS_INVALID')` se a forma não
bater. Decriptação acontece no service, **antes** de chamar o adapter — adapter nunca importa
`lib/crypto`.

## Adapters

Cada um em `features/messaging/channels/<provider>/` com `adapter.ts` + `schema.ts` (Zod da
credencial) + teste com `fetch` mockado — nunca chamada real em teste.

**`META_CLOUD`** (Graph API, `graph.facebook.com`):
- `send`: `POST /{phoneNumberId}/messages`, `Authorization: Bearer {accessToken}`, sempre
  `type: "template"` — a régua nunca fala com quem não iniciou conversa, está sempre fora da
  janela de 24h (ver doc 06). `template.name = templateRef.name`, `language.code = "pt_BR"`,
  parâmetros posicionais em `components[0].parameters`.
- Erro 4xx com código de rate limit → `retryable: true`; template rejeitado/inválido →
  `retryable: false`.
- `healthCheck`: `GET /{phoneNumberId}?fields=id` — token e id válidos.

**`EVOLUTION`** (servidor self-hosted do cliente, `baseUrl` próprio):
- `send`: `POST {baseUrl}/message/sendText/{instanceName}`, header `apikey`, body
  `{ number: toPhone, text: body }`.
- Timeout curto (rede do cliente pode estar instável) → timeout conta como `retryable: true`.
- `healthCheck`: `GET {baseUrl}/instance/connectionState/{instanceName}` — só `ok: true` se
  `state === 'open'` (sessão WhatsApp conectada, não só servidor respondendo).

**`SALVY`**: ⚠️ a forma exata da API (endpoint, payload, auth) não está confirmada nesta spec —
vai ser puxada da documentação oficial do provider no momento da implementação deste adapter
específico, em vez de suposta aqui. O contrato (`send`/`healthCheck`, capabilities da tabela
acima) não muda; só o `fetch` interno. Se a doc pública divergir do que está aqui, este arquivo
é atualizado antes do merge do adapter.

Mapeamento de erro comum aos 3: `5xx`, timeout ou erro de rede → `retryable: true`; `4xx` de
validação (número inválido, template rejeitado, credencial errada) → `retryable: false`. Usado
pelo `messages-dispatch` na Etapa 4.

## Service / Actions / Queries

```
features/messaging/
  schema.ts     Zod: 1 schema por provider + discriminated union p/ saveChannelCredentials
  queries.ts    listChannelConfigs() → DTO sem credentials
  service.ts    saveChannelCredentials, testChannelConnection, setChannelActive, setDefaultChannel
  actions.ts    Server Actions finas
  channels/     interface + registry + 3 adapters
```

**`listChannelConfigs()`** — sempre 3 linhas (uma por valor do enum), mescladas com o que
existe no banco. DTO nunca inclui `credentials`:

```ts
type ChannelConfigDTO = {
  provider: ChannelProvider;
  configured: boolean;        // existe linha no banco
  label: string;
  isActive: boolean;
  isDefault: boolean;
  phoneNumber: string | null;
  riskAcceptedAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastError: string | null;
};
```

**Service** — 4 operações, uma razão de mudar cada:

- `saveChannelCredentials(provider, data, riskAccepted?)` — valida forma pelo schema do
  provider; `EVOLUTION` sem `riskAccepted === true` lança `EvolutionRiskNotAcceptedError`.
  Cripta, `upsert` por `provider`. Salvar credencial **não ativa** o canal.
- `testChannelConnection(provider)` — decripta, chama `adapter.healthCheck()`, grava
  `lastCheckAt/lastCheckOk/lastError`. Retorna o resultado pra UI mostrar na hora, sem
  depender de reload.
- `setChannelActive(provider, active: boolean)` — só liga se `lastCheckOk === true`; senão
  `ChannelNotVerifiedError`. Impede ativar canal nunca testado ou testado com falha.
- `setDefaultChannel(provider)` — exige `isActive`; transação zera `isDefault` dos outros e
  seta no alvo. O índice único parcial no banco é o cinto de segurança; isto aqui é erro cedo
  na UI.

**Actions**: `saveChannelCredentialsAction`, `testChannelConnectionAction`,
`setChannelActiveAction`, `setDefaultChannelAction`. Cada uma: `requireSession()` → Zod →
service → `revalidatePath('/channels')`. `testChannelConnectionAction` devolve
`{ ok, reason? }` direto pro card, sem exigir reload da página.

Erros de domínio: `CHANNEL_CREDENTIALS_INVALID`, `EVOLUTION_RISK_NOT_ACCEPTED`,
`CHANNEL_NOT_VERIFIED` — mensagens em pt-BR, sem jargão.

## UI

Rota `/channels` (convenção do projeto: inglês plural), item novo "Canais" na sidebar.

```
app/(app)/channels/page.tsx        Server Component — 3 cards a partir de listChannelConfigs()
features/messaging/components/
  channel-card.tsx                 1 provider: status badge, telefone, último teste, ações
  channel-credentials-dialog.tsx   client — form por provider (schema muda por provider)
  channel-risk-banner.tsx          só quando provider === EVOLUTION, checkbox de aceite
```

- `page.tsx`: `AppShell` + grid de 3 `ChannelCard`. Uma query só, sem N+1.
- `ChannelCard` (server): badge verde/vermelho/cinza a partir de `configured`/`isActive`/
  `lastCheckOk`; botão "Configurar"/"Editar" abre `ChannelCredentialsDialog`.
- `ChannelCredentialsDialog` (client): `react-hook-form` + schema Zod do provider (mesmo da
  action). Campos nunca pré-populados com credencial existente. Submit →
  `saveChannelCredentialsAction`; ao fechar, botão "Testar conexão" dispara
  `testChannelConnectionAction`, resultado inline via estado local.
- Toggle "Ativar" desabilitado até `lastCheckOk === true`, com `title` explicando o motivo —
  espelha a regra do service na UI.
- Radio "Padrão" só aparece em canais `isActive`; troca chama `setDefaultChannelAction` direto,
  sem dialog.
- `EVOLUTION`: `ChannelRiskBanner` acima do form — texto do risco de banimento (WhatsApp não
  permite este tipo de integração) + checkbox obrigatório para habilitar "Salvar";
  `riskAccepted` vai junto no submit.

Estados: os 3 cards sempre renderizam — enum fixo cobre o "vazio". Erro de teste de conexão
aparece no próprio card (`lastError`), não como toast solto, para ficar registrado.

## Testes (TDD obrigatório — trava de segurança/domínio)

- Cada adapter: `send`/`healthCheck` contra `fetch` mockado — sucesso, erro retryable, erro
  não-retryable, timeout.
- Credencial: ida e volta da criptografia (reuso do teste já existente de `lib/crypto.ts`,
  aplicado ao JSON de cada provider), falha explícita com chave errada.
- `saveChannelCredentials` rejeita `EVOLUTION` sem `riskAccepted`.
- `setChannelActive(true)` rejeita canal com `lastCheckOk !== true`.
- `setDefaultChannel` — dois canais ativos, definir padrão dos dois em sequência: só um fica
  `isDefault=true` ao final (concorrência coberta pelo índice único parcial, testado com
  inserção dupla real contra Postgres, não só o `if` do service).
- Nenhum adapter referenciado por nome fora de `features/messaging/channels` — grep no código
  como parte da suíte ou do checklist de PR.

## Critério de pronto

Operador configura um canal (mock de credencial válida em dev), testa conexão e recebe
`ok: true`/`ok: false` correto, ativa o canal, marca como padrão. `saveChannelCredentials`
chamado duas vezes com o mesmo provider não cria duas linhas. Nenhuma credencial aparece em
log, Sentry, resposta de erro ou volta pro componente cliente. Envio real de mensagem fica
para a Spec 3c — esta spec entrega a fundação testável, não uma mensagem chegando no WhatsApp.
