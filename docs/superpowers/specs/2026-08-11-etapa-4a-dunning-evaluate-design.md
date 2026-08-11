# Etapa 4a — `dunning-evaluate` + modo revisão (design)

> Primeira das duas specs do motor de despacho. Avalia cobranças contra a régua,
> grava `DunningExecution` idempotente, consolida por cliente (T7), cria `Message`
> `PENDING` — **nunca envia nada**. Modo revisão fica navegável. Envio de verdade
> (T6 quiet hours, T8 kill switch, `messages-dispatch`) é a Spec 4b.

## Contexto

Doc de domínio: [`docs/projeto/tecnico/06-regua-e-canais.md`](../../projeto/tecnico/06-regua-e-canais.md)
("Motor — avaliação diária", "Modo revisão"). Modelo `DunningExecution` já
especificado em [`02-modelo-de-dados.md`](../../projeto/tecnico/02-modelo-de-dados.md#régua)
mas **nunca criado** — a spec de régua mínima (Etapa 3) deferiu isso explicitamente
pra esta spec.

`DunningRule`/`DunningStep`/templates já existem (régua mínima). Régua padrão já
nasce em `REVIEW` (seed). `Message`/`MessageKind.DUNNING`/T7 (índice único parcial
`WHERE kind = 'DUNNING'`) já existem (Etapa 3c-1).

## Escopo

- Migration: `DunningExecution` + `ExecutionOutcome` (`QUEUED | SKIPPED |
  PENDING_REVIEW`), relação `DunningStep.executions` (aditiva, adiada até aqui)
- `core/dunning-rules.ts`: `daysFromDue` (dias até/desde o vencimento, local) e
  `consolidate` (agrupa passos pendentes por cliente, no máximo 1 mensagem/dia)
- `features/dunning/evaluate.ts`: orquestra o loop de avaliação
- Job `app/api/cron/dunning-evaluate/route.ts`, autenticado (mesmo padrão de
  `charges-mark-overdue`)
- Tela `/regua`: prévia do modo revisão + as 3 opções de ativação
- Ação `SUSPEND`: transiciona `Subscription.status`, sem cortar acesso técnico
- Alerta simples no dashboard pra `SUSPEND`/`NOTIFY_OWNER`, sem modelo novo

**Fora de escopo** (Spec 4b): `messages-dispatch`, T6 (quiet hours no envio), T8
(kill switch), retry, envio de verdade. As `Message` criadas aqui ficam `PENDING`
até a Spec 4b existir — rodar `dunning-evaluate` sozinho nesta spec não manda nada
pro WhatsApp, por design.

## Schema

```prisma
enum ExecutionOutcome {
  QUEUED
  SKIPPED
  PENDING_REVIEW
}

model DunningExecution {
  id        String           @id @default(uuid(7))
  chargeId  String
  stepId    String
  outcome   ExecutionOutcome
  reason    String?                          // opted_out | no_phone | review
  messageId String?          @unique
  createdAt DateTime         @default(now())

  charge    Charge           @relation(fields: [chargeId], references: [id], onDelete: Cascade)
  step      DunningStep      @relation(fields: [stepId], references: [id], onDelete: Cascade)
  message   Message?         @relation(fields: [messageId], references: [id])

  @@unique([chargeId, stepId])
  @@map("dunning_executions")
}
```

- `@@unique([chargeId, stepId])` é a trava de idempotência — rodar o job duas
  vezes no mesmo dia não duplica execução nem mensagem, garantido pelo banco.
- `DunningStep.executions DunningExecution[]` entra como campo aditivo (a régua
  mínima já deixou o comentário sobre essa adição futura).
- `Message.execution DunningExecution?` (relação inversa) — `Message` já existe,
  só ganha o campo de relação.

## `core/dunning-rules.ts`

```ts
/** Dias entre hoje (local) e o vencimento — negativo = antes, positivo = depois. */
export function daysFromDue(dueAt: Date, now: Date, timezone: string): number;

export type PendingStep = {
  customerId: string;
  chargeId: string;
  stepId: string;
  templateBody: string;
  context: Record<string, string>; // já resolvido (nome, valor, vencimento, dias_atraso, pix, negócio)
};

export type ConsolidatedMessage = {
  customerId: string;
  body: string;                 // texto final, já consolidado se >1 cobrança
  stepIds: string[];             // todos os passos que essa mensagem cobre
  chargeIds: string[];
};

/** Agrupa passos pendentes por cliente — no máximo 1 mensagem por customerId. */
export function consolidate(pending: PendingStep[], now: Date, timezone: string): ConsolidatedMessage[];
```

- `daysFromDue` usa a mesma base de `localDateOnly`/`startOfLocalDay` já existente
  em `core/dates.ts` — diferença de dias de calendário local, não de milissegundos
  brutos (mesma correção já aplicada no bug do `daysOverdue` da prévia de template,
  Etapa 3c-1).
- **Consolidação de texto**: cliente com 2+ cobranças vencidas no mesmo dia recebe
  **uma** mensagem. O texto consolidado usa o template do passo de **maior
  prioridade** (o mais atrasado — `SUSPEND` > `SEND_MESSAGE` tardio > `SEND_MESSAGE`
  cedo) como corpo base, com uma linha extra listando o total das outras cobranças
  ("+ mais N cobrança(s), totalizando R$X"). Isso é uma decisão de produto que o doc
  não detalha byte a byte — registrada aqui explicitamente pra não virar ambiguidade
  na implementação.

## `features/dunning/evaluate.ts`

```ts
export async function evaluateDunningRule(now: Date): Promise<{
  queued: number; skipped: number; pendingReview: number; suspended: number;
}>
```

Passo a passo:

1. Busca a régua padrão com os passos ativos (`getDefaultRuleWithSteps`, já existe).
2. Busca todas as `Charge` com `status IN (OPEN, OVERDUE, PARTIALLY_PAID)`.
3. Para cada `(charge, step)`: calcula `daysFromDue(charge.dueAt, now, tz)`, pula se
   não bater com `step.offsetDays`. Pula se já existe `DunningExecution` pra esse
   par (checado em lote antes do loop — uma query, não uma por par, pra evitar N+1).
4. Régua em `REVIEW` → `DunningExecution` `PENDING_REVIEW`, sem mensagem, sem
   avançar pra T5. **Loop termina aqui nesta spec pra régua em REVIEW** — nada mais
   acontece até o operador ativar (Spec 4a mesma, ver "Modo revisão" abaixo).
5. Régua `ACTIVE`: checa T5 (`customer.optedOut`) e telefone — `SKIPPED` com motivo,
   sem mensagem.
6. Ação do passo:
   - `SEND_MESSAGE`: acumula em `PendingStep[]` por cliente (ainda sem
     `DunningExecution` — só depois da consolidação, junto com a `Message`).
   - `SUSPEND`: transação isolada por `(charge, step)` — `Subscription.status =
     SUSPENDED`, `DunningExecution` `QUEUED`, sem `Message` (é notificação
     interna, não WhatsApp).
   - `NOTIFY_OWNER`: `DunningExecution` `QUEUED`, sem `Message`, sem mudança de
     estado — só o marcador que a tela de alertas lê depois.
7. Depois do loop completo: `consolidate(pending, now, tz)` agrupa por cliente.
   Para cada `ConsolidatedMessage`: **uma transação por cliente** — cria `Message`
   `kind: DUNNING, status: PENDING` (T7 garante unicidade diária no banco) e um
   `DunningExecution` `QUEUED` por `(chargeId, stepId)` do grupo, todos apontando
   pro mesmo `messageId`. Falha na transação de um cliente **não derruba os
   outros** — capturada, logada, segue pro próximo.

⚠️ `scheduledFor`/`scheduledDate` da `Message` criada aqui usam `now` (o instante
do job) — a Spec 4b decide se precisa reagendar por quiet hours no despacho, não
aqui.

## Job

```ts
// app/api/cron/dunning-evaluate/route.ts
export async function POST(req: Request) {
  await assertCloudSchedulerToken(req);
  const result = await evaluateDunningRule(new Date());
  logger.info({ job: 'dunning-evaluate', ...result });
  return Response.json(result);
}
```

Mesmo padrão de `charges-mark-overdue` (já existe, Etapa 2) — casca, token OIDC,
`now` só nasce aqui.

## Modo revisão (UI, `/regua`)

Página já existe (régua mínima). Adiciona, quando `rule.status === 'REVIEW'`:

- Bloco "Prévia da ativação": conta quantas `DunningExecution` `PENDING_REVIEW`
  existem agrupadas por passo (`D-5: N execuções`, `D0: M execuções`, ...) — é o
  resultado acumulado de rodar `dunning-evaluate` várias vezes em `REVIEW` sem
  nunca enviar nada.
- 3 ações (doc 06): **Enviar todas**, **Ignorar retroativos e ativar**, **Manter em
  revisão**.
  - **Manter em revisão**: no-op, só fecha o bloco.
  - **Enviar todas**: muda `rule.status` pra `ACTIVE`. As execuções
    `PENDING_REVIEW` já gravadas **não são reprocessadas automaticamente** — elas
    ficam como estão (idempotência: o `@@unique([chargeId, stepId])` já as
    marcou como "vistas"). O próximo `dunning-evaluate` só processa pares novos
    daqui pra frente. Isso é uma limitação consciente: "enviar todas" ativa a
    régua pra frente, não reprocessa o passado — reprocessar exigiria apagar
    `DunningExecution`s `PENDING_REVIEW` existentes, o que é a opção seguinte.
  - **Ignorar retroativos e ativar** (pré-selecionada, doc 06): marca toda
    `Charge` `OPEN`/`OVERDUE`/`PARTIALLY_PAID` com `dueAt` anterior a `now` como
    "não gera passo retroativo" — na prática, isso significa **apagar as
    `DunningExecution` `PENDING_REVIEW` existentes** (elas nunca viraram mensagem,
    então apagar é seguro) e então `rule.status = ACTIVE`. O próximo
    `dunning-evaluate` reavalia essas cobranças do zero, mas como `daysFromDue`
    já passou do offset de vários passos antigos, a maioria não vai re-bater —
    só os passos cujo offset ainda está no futuro (ex.: se hoje é D-2 mas o
    passo D+5 ainda não passou, ele ainda dispara normalmente quando chegar a
    hora).

## Dashboard — alerta simples

Sem modelo novo. `features/dunning/queries.ts` ganha `listOperatorAlerts()`:
`Subscription` com `status: SUSPENDED` e `updatedAt` nas últimas 24h, mais
`DunningExecution` com `action: NOTIFY_OWNER` (via join no `step`) das últimas
24h. Componente novo em `features/dunning/components/`, montado em
`app/(app)/page.tsx` ao lado do `DashboardPanel` já existente (composição em
`app/`, sem `charges` importar de `dunning` nem vice-versa).

## Testes

- `core/dunning-rules.test.ts`: `daysFromDue` com fim de mês/virada de dia local;
  `consolidate` com 1 cliente/1 cobrança, 1 cliente/3 cobranças (uma mensagem só,
  texto consolidado), 2 clientes diferentes (2 mensagens).
- `features/dunning/evaluate.integration.test.ts` (Postgres real):
  - passo bate offset, régua REVIEW → `PENDING_REVIEW`, zero `Message`
  - régua ACTIVE, `optedOut` → `SKIPPED reason=opted_out`, zero `Message`
  - régua ACTIVE, sem telefone → `SKIPPED reason=no_phone`
  - rodar o job duas vezes no mesmo dia → mesma contagem de `DunningExecution`
    (idempotência via `@@unique`, inserção dupla real testada)
  - cliente com 2 cobranças vencendo no mesmo passo → 1 `Message`, 2
    `DunningExecution` apontando pro mesmo `messageId`
  - passo `SUSPEND` → `Subscription.status = SUSPENDED`, sem `Message`
  - falha ao processar um cliente não impede os demais (capturar erro
    simulado num cliente, confirmar outros clientes processados)
- Ativação: "ignorar retroativos" apaga só `PENDING_REVIEW`, nunca `QUEUED`/`SKIPPED`.

## Critério de pronto

Régua em `REVIEW`, job roda, `DunningExecution` `PENDING_REVIEW` aparece contado
na tela por passo — nenhuma `Message` criada, nada sai. Operador ativa com
"ignorar retroativos", régua vira `ACTIVE`. Job roda de novo: cobrança nova que
bate um offset gera `DunningExecution` `QUEUED` + `Message` `PENDING` (ainda não
enviada — Spec 4b faz isso). Rodar o job duas vezes seguidas não duplica nada.
Cliente com 3 cobranças vencidas no mesmo passo recebe 1 `Message`, não 3.
