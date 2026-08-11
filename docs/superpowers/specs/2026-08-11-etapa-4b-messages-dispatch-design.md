# Etapa 4b — messages-dispatch (motor de despacho) — Design

> Fonte de verdade do domínio: `docs/projeto/tecnico/06-regua-e-canais.md`, seção "Motor — despacho" e tabela "Travas". Este spec detalha a implementação — decisões de arquivo, tipos, casos de borda — sem contradizer o doc de domínio.

## Objetivo

`dunning-evaluate` (Etapa 4a) já cria `Message` `PENDING` consolidadas por cliente. Falta o job que efetivamente envia: respeita kill switch (T8), quiet hours (T6), opt-out e pagamento reconferidos no momento do envio (T5), idade máxima de 24h (`stale`), retry com limite, e grava o resultado auditável na timeline do cliente.

Fora de escopo: envio manual (`dispatch.ts`/`sendManualBatch`, já existe, não muda). Lógica de template aprovado da Meta (`metaTemplateName`) — gap já existente em `evaluate.ts`, não introduzido nem fechado aqui.

## Arquitetura

Um arquivo novo de orquestração, uma função pura nova, uma rota de cron, um ajuste de DTO/UI pra mostrar `cancelReason` na timeline. Mesma forma de `evaluate.ts`: loop de mensagens elegíveis, decisão por mensagem, update isolado (sem transação em volta de chamada HTTP externa — regra dura do projeto).

```
core/dates.ts                              + nextQuietHourStart (pura)
features/messaging/
  scheduled-dispatch.ts                    novo — motor do cron
  queries.ts                               MessageDTO + cancelReason
  components/message-timeline.tsx          mostra cancelReason
app/api/cron/messages-dispatch/route.ts    novo — casca OIDC
```

## Componentes

### `core/dates.ts` — `nextQuietHourStart`

```ts
/** Próximo instante dentro da janela [startHour, endHour) no fuso local, a partir de `now`.
 *  Se `now` já está dentro da janela, retorna o início do PRÓXIMO dia (T6 só reagenda pra frente). */
export function nextQuietHourStart(now: Date, startHour: number, endHour: number, timezone: string): Date
```

Regras:
- `now` antes de `startHour` local → hoje às `startHour:00:00` local.
- `now` às ou depois de `endHour` local → amanhã às `startHour:00:00` local.
- Função só é chamada quando `isWithinLocalHourRange` já deu `false` — não precisa tratar o caso "dentro da janela" como entrada válida, mas o teste cobre o comportamento definido acima por clareza.

### `features/messaging/scheduled-dispatch.ts`

```ts
export type DispatchResult = {
  sent: number;
  failed: number;
  cancelledStale: number;
  cancelledOptedOut: number;
  cancelledPaid: number;
  rescheduled: number;
};

export async function dispatchPendingMessages(now: Date): Promise<DispatchResult>
```

Fluxo, nesta ordem exata (espelha o pseudocódigo do doc de domínio):

1. **T8 — kill switch.** `Settings.sendingPaused === true` → retorna `{ sent: 0, failed: 0, cancelledStale: 0, cancelledOptedOut: 0, cancelledPaid: 0, rescheduled: 0 }` sem consultar `Message`. Nada é cancelado enquanto pausado — o `stale` da mensagem acumulada só dispara quando o job volta a rodar (o doc explica isso explicitamente: pausar 3 dias não pode disparar tudo de uma vez ao despausar).
2. **Canal padrão.** Busca `ChannelConfig` com `isDefault: true, isActive: true`. Não achou → loga `logger.warn({ job: 'messages-dispatch', reason: 'no_default_channel' })` e retorna o resultado zerado. Cron não lança erro pro usuário — quem configura o canal é o operador, e a ausência já aparece na tela de Canais.
3. **Busca o lote.** `db.message.findMany({ where: { status: 'PENDING', scheduledFor: { lte: now } }, orderBy: { createdAt: 'asc' }, take: 60, include: { customer: true } })`.
4. **Por mensagem**, nesta ordem, cada ramo termina o processamento daquela mensagem (não passa pro próximo `if`):
   - **Idade > 24h** (`now.getTime() - msg.createdAt.getTime() > 24 * 60 * 60 * 1000`): `UPDATE status='CANCELLED', cancelReason='stale'`. `cancelledStale++`.
   - **Fora da quiet hour** (`!isWithinLocalHourRange(now, settings.quietHourStart, settings.quietHourEnd, settings.timezone)`): `UPDATE scheduledFor = nextQuietHourStart(now, ...)`. Status continua `PENDING`. `rescheduled++`. Não conta como enviada nem cancelada.
   - **`customer.optedOut`**: `UPDATE status='CANCELLED', cancelReason='opted_out'`. `cancelledOptedOut++`.
   - **Cobrança(s) ligada(s) já paga(s)/cancelada(s)**: busca `DunningExecution` onde `messageId = msg.id`, seleciona `charge.status`. Só existe para `kind='DUNNING'` — mensagens `MANUAL`/`TEST` nunca têm `DunningExecution`, então esse passo é pulado pra elas (nenhuma linha encontrada ⇒ não cancela por pagamento). Se existem linhas E **todas** as cobranças ligadas estão em `PAID` ou `CANCELLED` → `UPDATE status='CANCELLED', cancelReason='payment_received'`. `cancelledPaid++`. Se pelo menos uma cobrança ligada ainda está `OPEN`/`OVERDUE`/`PARTIALLY_PAID`, a mensagem é sobre o total pendente — segue pro envio.
   - **Envio**: `adapter.send({ toPhone: msg.toPhone, body: msg.body }, credentials)`.
     - `ok: true` → `UPDATE status='SENT', sentAt=now, externalId, channelId, attempts=msg.attempts+1`. `sent++`.
     - `ok: false` → `attempts = msg.attempts + 1`. Se `!retryable || attempts >= 3` → `UPDATE status='FAILED', failReason=reason, attempts`. Senão → `UPDATE attempts` só (mensagem continua `PENDING`, mesmo `scheduledFor` — próxima passada do cron pega de novo porque `scheduledFor <= now` continua verdadeiro). `failed++` só no caso `FAILED` definitivo; tentativa que fica `PENDING` não soma em nenhum contador (não é nem sucesso nem falha final).
5. Cada mensagem processada em `try/catch` isolado — erro inesperado (ex.: falha de rede não tratada pelo adapter) é logado com `logger.error({ job: 'messages-dispatch', messageId, error })` e a passada continua para as próximas mensagens do lote.
6. Credenciais são descriptografadas **uma vez** fora do loop (mesmo canal pra todo o lote, igual a `sendManualBatch`).

### `app/api/cron/messages-dispatch/route.ts`

Casca idêntica a `charges-mark-overdue/route.ts` e `dunning-evaluate/route.ts`: `assertCloudSchedulerToken` → 401 sem corpo se falhar → `dispatchPendingMessages(new Date())` → `logger.info({ job: 'messages-dispatch', ...result })` → `NextResponse.json(result)`.

### `features/messaging/queries.ts` — `MessageDTO`

Adiciona `cancelReason: string | null` (mesmo padrão de `failReason`, já `String?` no schema — nenhuma migration necessária).

### `features/messaging/components/message-timeline.tsx`

Mostra `msg.cancelReason` do mesmo jeito que já mostra `msg.failReason` (texto em `text-xs text-danger` abaixo do corpo). Motivo textualizado em pt-BR: `stale` → "Cancelada: mensagem parada há mais de 24h", `opted_out` → "Cancelada: cliente pediu pra sair", `payment_received` → "Cancelada: cobrança já paga". Mapa local no componente, mesmo padrão de `STATUS_ICON`/`KIND_LABEL` já existentes no arquivo.

## Dados e idempotência

- Nenhuma constraint nova no banco — a idempotência do despacho não é "não enviar duas vezes a mesma `Message`": uma vez `SENT`/`FAILED`/`CANCELLED`, o `WHERE status = 'PENDING'` já a exclui do próximo lote. Rodar o job duas vezes no mesmo minuto processa o mesmo conjunto de `PENDING` só se a primeira passada não terminou a tempo — aceitável, cada mensagem é reavaliada do zero (reconfere opt-out/pagamento/stale de novo, então não há duplo envio: a segunda passada só age sobre o que a primeira não terminou).
- `attempts` cresce em toda tentativa de envio (sucesso ou falha), nunca nas ramificações de cancelamento/reagendamento — essas não são "tentativa de envio".

## Erros

Não há `DomainError` novo — este é um job de cron, sem usuário síncrono esperando resposta. Falhas de item viram log + contador, nunca exceção que derruba o lote (mesmo padrão de `evaluate.ts`/`markOverdueCharges`).

## Testes obrigatórios (do doc de domínio, seção "Casos de teste")

- Mensagem agendada para 21:30 é reagendada para 08:00 do dia seguinte, não descartada (T6).
- `optedOut` marcado depois da avaliação e antes do despacho cancela o envio (T5).
- Pagamento registrado depois da avaliação e antes do despacho cancela o envio.
- `sendingPaused` impede todo envio; mensagem parada há mais de 24h vira `CANCELLED` com motivo `stale` (T8) — incluindo o caso "ficou pausado, várias mensagens velhas se acumularam, só cancelam quando o job volta a rodar".
- Falha retryable incrementa `attempts`; na terceira, vira `FAILED` com motivo visível na timeline.
- Falha não-retryable vira `FAILED` na primeira tentativa (sem gastar as 3 rodadas).
- Nenhum adapter é referenciado por nome fora de `features/messaging/channels` (busca no código).

Casos adicionais específicos desta implementação:
- `nextQuietHourStart`: antes da janela → hoje `startHour`; depois da janela → amanhã `startHour`.
- Mensagem `MANUAL` nunca aparece no lote (nunca fica `PENDING`) — não precisa de teste de integração dedicado além de confirmar que `sendManualBatch` já cria com `status` terminal (já coberto pelos testes existentes de `dispatch.ts`).
- Mensagem `DUNNING` sem nenhuma `DunningExecution` ligada (caso não deveria ocorrer na prática, mas a query permite) não é cancelada por "pagamento" — segue pro envio.
- Duas cobranças ligadas à mesma `Message` consolidada: uma paga, outra ainda aberta → **não** cancela (ainda há saldo pendente pra cobrar); as duas pagas/canceladas → cancela.
- Lote respeita `take: 60` e a ordem `createdAt asc`.
- Kill switch ligado: zero `Message` tocada, contadores todos zero.
- Sem canal padrão ativo: zero `Message` tocada, log de warning, sem exceção.

## Fora de escopo (não implementar aqui)

- 🔮 Template aprovado da Meta (`metaTemplateName`) na decisão de envio — gap pré-existente em `evaluate.ts`.
- 🔮 Failover automático de canal — explicitamente descartado pelo doc de domínio.
- Alertas de operador para "sem canal padrão"/"kill switch ligado há muito tempo" — os alertas de dashboard hoje cobrem só `SUSPEND`/`NOTIFY_OWNER` (Etapa 4a); estender pra cobrir despacho fica pra quando/se pedido.
