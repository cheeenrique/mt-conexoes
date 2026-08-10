# Etapa 3c-1 — Envio manual assistido + timeline (design)

> Segunda das duas specs que fecham a Etapa 3 depois da fundação de canal (3a) e da
> régua mínima (3b/regua-minima). Cobre envio manual assistido (outbound) e a timeline
> de mensagens na ficha do cliente. **Não cobre** webhook de resposta nem opt-out
> automático por palavra-chave (inbound) — isso é a Spec 3c-2, fluxo de dado oposto.
>
> Fecha o critério de pronto da Etapa 3: "mensagem real chega no WhatsApp de um número
> de teste."

## Contexto

Doc de domínio: [`docs/projeto/tecnico/06-regua-e-canais.md`](../../projeto/tecnico/06-regua-e-canais.md)
(seção "Envio manual assistido"). Modelo `Message` em
[`docs/projeto/tecnico/02-modelo-de-dados.md`](../../projeto/tecnico/02-modelo-de-dados.md#mensagens-e-canais).

O doc descreve envio manual como sujeito às mesmas travas do motor de despacho (T5
opt-out, T6 quiet hours) exceto T7 (dedupe diária — "escolha consciente do operador").
T6 de verdade ("fora da janela, reagenda") pressupõe uma fila e um job (`messages-dispatch`,
Etapa 4) que não existe ainda. Resolução: **despacho síncrono, sem fila**. A Server
Action chama `adapter.send()` na hora, dentro do request. Fora da janela de quiet
hours, a ação inteira é recusada com erro claro — nunca reagenda. Reagendamento de
verdade fica pra Etapa 4, quando a régua (que sim precisa disso) chegar.

## Escopo

- Tela `/charges`: botão "Enviar mensagem" a partir do filtro atual, abre dialog
- Dialog: lista de clientes (deduplicados), textarea de texto livre com `{{variáveis}}`,
  prévia por cliente, confirmação por digitação acima de 100 destinatários
- `features/messaging/dispatch.ts`: envio síncrono sequencial, respeita T5/T6, grava
  `Message` por destinatário com resultado real
- Aba "Mensagens" na ficha do cliente (`customer-tabs.tsx` já tem o slot, hoje
  desabilitado) — timeline de `Message` por cliente

**Fora de escopo** (Spec 3c-2): webhook de recebimento por provider, opt-out
automático por palavra-chave, `supportsInboundReply`. Fora de escopo (Etapa 4):
`messages-dispatch`, fila/reagendamento de verdade, `DunningExecution`, T7, T8, régua
automática.

## Decisões de escopo (documentadas pra não virar ambiguidade)

- **Dedupe por cliente dentro do mesmo lote**: o filtro de `/charges` opera em
  cobranças, não clientes — um cliente com 3 cobranças vencidas aparece 3 vezes. O
  envio manual deduplica por `customerId` antes de montar a lista de destinatários
  (um envio por cliente, não por cobrança), evitando o operador mandar 3 mensagens
  pro mesmo número sem querer. Isso é uma escolha de produto, não a trava T7 do banco
  (que não se aplica a `kind = MANUAL`).
- **Opt-out é filtro de exclusão silenciosa, não `Message` com status `SKIPPED`**:
  clientes com `optedOut = true` nunca entram na lista de destinatários nem geram
  linha em `Message` — a tela mostra "N cliente(s) com opt-out foram excluídos" antes
  da confirmação. Evita poluir a timeline com tentativas que nunca existiram.
- **Canal usado é sempre o padrão ativo** (`ChannelConfig.isDefault = true, isActive =
  true`). Sem canal padrão configurado, a ação recusa com erro antes de montar
  qualquer prévia.
- **Sem cap artificial de tamanho de lote** nesta spec — é síncrono e pode demorar em
  lotes muito grandes (centenas), mas isso é um limite conhecido, não escondido (ver
  Recomendação no fim). Resolver com fila real é Etapa 4, não aqui.

## Schema

```prisma
enum MessageKind   { DUNNING MANUAL TEST }
enum MessageStatus { PENDING SENT FAILED CANCELLED SKIPPED }

model Message {
  id            String         @id @default(uuid(7))
  customerId    String
  chargeId      String?
  channelId     String?
  kind          MessageKind    @default(DUNNING)
  status        MessageStatus  @default(PENDING)

  toPhone       String
  body          String
  scheduledFor  DateTime
  scheduledDate DateTime       @db.Date
  sentAt        DateTime?
  externalId    String?
  attempts      Int            @default(0)
  failReason    String?
  cancelReason  String?
  createdAt     DateTime       @default(now())

  customer      Customer       @relation(fields: [customerId], references: [id])
  charge        Charge?        @relation(fields: [chargeId], references: [id])
  channel       ChannelConfig? @relation(fields: [channelId], references: [id])

  @@index([status, scheduledFor])
  @@index([customerId, createdAt])
  @@map("messages")
}
```

- `execution DunningExecution?` **não existe ainda** — mesma regra da spec de régua
  mínima, entra aditivamente na Etapa 4.
- **SQL manual**: índice único parcial `messages_dunning_daily_dedupe ON messages
  (customer_id, scheduled_date) WHERE kind = 'DUNNING' AND status <> 'CANCELLED'` —
  já documentado no doc de dados, entra nesta migration porque é a primeira vez que
  `Message` é criado. Não bloqueia `MANUAL` (a `WHERE` só pega `DUNNING`), consistente
  com "exceto a dedupe diária".
- Para envio síncrono: `scheduledFor = now`, `scheduledDate = localDateOnly(now,
  timezone)`, `status` grava direto `SENT`/`FAILED` (nunca fica `PENDING` — não existe
  fila que vá processar depois).

## `features/messaging/dispatch.ts`

```ts
export async function sendManualBatch(input: {
  customerIds: string[];
  body: string;      // com {{variáveis}}, ainda não renderizado
  now: Date;
}): Promise<{ sent: number; failed: number; skippedOptedOut: number; results: DispatchResultDTO[] }>
```

Passo a passo, dentro de uma única chamada (sem transação cobrindo tudo — cada
`Message` é seu próprio registro, uma falha de envio não deve reverter os sucessos
anteriores; ver "Transação" abaixo):

1. `assertKnownVariables(body)` — mesmo motor de `core/dunning-template.ts` (Spec
   régua mínima). Erro de variável desconhecida recusa a chamada inteira, antes de
   qualquer envio.
2. Resolve o canal padrão ativo (`ChannelConfig.isDefault && isActive`). Sem canal →
   `NoDefaultChannelError`.
3. Checa quiet hours (`Settings.quietHourStart/quietHourEnd`, fuso do negócio) contra
   `now`. Fora da janela → `OutsideQuietHoursError`, **nenhum envio acontece** (T6,
   versão síncrona: recusa em vez de reagendar).
4. Busca os `Customer` dos `customerIds`, filtra `optedOut = false` (T5) — os
   excluídos entram em `skippedOptedOut`, sem virar `Message`.
5. Deduplica por `customerId` (já devia vir deduplicado da UI, mas o service não
   confia no caller).
6. **Sequencial, um por vez** (não `Promise.all`) — respeita
   `adapter.capabilities.rateLimitPerMinute` sem estourar. Para cada cliente:
   - Monta `TemplateContext` (mesmo formato da prévia da régua) e chama
     `renderTemplate`.
   - Decripta a credencial do canal, chama `adapter.send({ toPhone, body: rendered
     })`.
   - Grava `Message` com o resultado real: `status: 'SENT'` + `externalId` se
     `result.ok`; `status: 'FAILED'` + `failReason: result.reason` se não.
   - Uma falha num destinatário **não interrompe os seguintes** — motivo pelo qual
     cada `Message` é seu próprio `create`, não uma transação em lote.
7. Devolve o resumo (`sent`/`failed`/`skippedOptedOut`) pra UI mostrar.

`chargeId` na `Message` fica preenchido quando o cliente tinha exatamente uma cobrança
no filtro original; com múltiplas, fica `null` (a mensagem é sobre o cliente, não uma
cobrança específica — dedupe por cliente já assumiu isso).

## Server Action

```ts
export async function sendManualMessagesAction(input: unknown): Promise<
  | { ok: true; summary: { sent: number; failed: number; skippedOptedOut: number } }
  | { error: { code: string; message: string } }
>
```

`requireSession()` → Zod (`customerIds: z.array(z.uuid()).min(1)`, `body:
z.string().min(1)`) → `sendManualBatch({ ...parsed, now: new Date() })` →
`revalidatePath` na ficha de cada cliente afetado (ou só `/customers`, mais simples —
a timeline é lida via Server Component na próxima navegação de qualquer forma) → mapeia
erro.

⚠️ Único lugar do projeto onde `now: new Date()` nasce fora de `core/` propositalmente
— a Server Action é a borda, `dispatch.ts` recebe `now` por parâmetro como qualquer
outro service testável (mesma regra de `core/`, aplicada aqui na camada de service
porque `dispatch.ts` decide quiet hours, que é lógica de negócio, não cálculo puro —
mas o relógio ainda entra por parâmetro pra manter o teste determinístico).

## UI

```
features/charges/components/
  send-message-button.tsx     abre o dialog, recebe os customerIds já filtrados/deduplicados
  send-message-dialog.tsx     textarea + prévia por cliente + confirmação por digitação
features/customers/components/
  message-timeline.tsx        lista de Message por cliente, mais recente primeiro
components/ui/
  type-to-confirm-dialog.tsx  variante do ConfirmDialog pra "digite N pra confirmar"
```

- `SendMessageButton` (server, em `/charges`): recebe a lista de `customerId` únicos
  já presente na página (derivada do `rows` de `listCharges`, que já tem
  `customerId`). Botão "Enviar mensagem" abre `SendMessageDialog` (client) passando
  esses ids + os nomes pra prévia.
- `SendMessageDialog`: textarea livre (reusa visualmente o padrão de `StepDrawer`),
  abaixo a lista dos clientes que vão receber com prévia por cliente (reusa a mesma
  ideia de `TemplatePreview`, mas aqui não é "escolher uma cobrança" — é "mostrar o
  texto renderizado pra cada destinatário real da lista", já que o contexto varia por
  pessoa). Se `customerIds.length > 100`, o botão de confirmar final fica desabilitado
  até o operador digitar o número exato em um campo — usa `TypeToConfirmDialog`.
- `MessageTimeline`: habilita a aba "Mensagens" em `customer-tabs.tsx` (hoje
  `disabled: true, title: 'Disponível na Etapa 3'`). Cada linha: data/hora local,
  ícone de status (✓ enviado / ✗ falhou), início do texto, canal usado. Falha mostra
  `failReason` visível — "mensagem que não saiu e ninguém soube é pior que mensagem
  que não saiu" (doc 06).

## Erros de domínio

- `NoDefaultChannelError` — "Configure um canal padrão em Canais antes de enviar."
- `OutsideQuietHoursError` — "Fora do horário permitido (08h–20h). Tente novamente
  dentro da janela."
- `UnknownTemplateVariableError` — reusa a mesma classe da régua mínima (mesma
  mensagem, mesmo código `UNKNOWN_TEMPLATE_VARIABLE`) — o texto livre do envio manual
  passa pelo mesmo validador de `core/dunning-template.ts`, não um segundo.

## Testes

- `dispatch.ts` (integration, Postgres real):
  - variável desconhecida recusa antes de qualquer `Message` criado
  - sem canal padrão ativo recusa, zero `Message` criado
  - fora de quiet hours recusa, zero `Message` criado (mock do relógio via parâmetro
    `now`, não `vi.setSystemTime`)
  - cliente com `optedOut = true` nunca vira `Message`, aparece em `skippedOptedOut`
  - 2 clientes, adapter mockado: 1 sucesso + 1 falha → 1 `Message` `SENT`, 1
    `FAILED`, ambos persistidos (falha não derruba o sucesso anterior)
  - dedupe: mesmo `customerId` duas vezes na entrada gera **uma** `Message`
- UI: `TypeToConfirmDialog` — botão de confirmar só habilita com o número exato
  digitado (teste de componente, `vitest` + testing-library se já configurado no
  projeto — checar antes de escrever, senão é teste manual documentado como tal).

## Critério de pronto

Operador filtra cobranças em atraso em `/charges`, clica "Enviar mensagem", escreve
texto com `{{cliente.primeiro_nome}}`, vê a prévia com nome real de cada destinatário,
confirma, e a mensagem sai de verdade pro WhatsApp de um número de teste via o canal
configurado — usando a Etapa 3a. Cliente com opt-out nunca recebe. Fora do horário
permitido, nada sai e o operador vê o motivo. A ficha do cliente mostra a mensagem na
aba "Mensagens" com o resultado real.

## Recomendação (não bloqueia esta spec)

Lote muito grande (centenas) num envio síncrono pode aproximar do timeout da
plataforma. Não é um problema agora (escala do projeto, uso ocasional assistido), mas
se isso virar rotina antes da Etapa 4, vale considerar processar em blocos com
"continuar depois" — mesmo padrão que `messages-dispatch` vai usar. Não implementado
aqui por YAGNI: sem caso de uso real hoje que precise disso.
