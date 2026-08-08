# Régua mínima — modelo, editor de passos e templates (design)

> Puxa pra frente da Etapa 4 só o que a Etapa 3 precisa pra ter onde editar template:
> `DunningRule`/`DunningStep` + tela de edição de passos com validação e prévia de
> variável. **Não inclui** avaliação (`dunning-evaluate`), despacho
> (`messages-dispatch`), travas T5–T8 nem `DunningExecution` — isso continua Etapa 4.
> Nenhuma mensagem sai do sistema ao final desta spec.

## Contexto

Doc de domínio: [`docs/projeto/tecnico/06-regua-e-canais.md`](../../projeto/tecnico/06-regua-e-canais.md)
(seções "Régua padrão entregue" e "Templates"). Modelo base em
[`docs/projeto/tecnico/02-modelo-de-dados.md`](../../projeto/tecnico/02-modelo-de-dados.md#régua).

Etapa 3 do plano de entrega pede "editor de template com variáveis e prévia usando
dados reais", mas template não é entidade própria — vive em `DunningStep.templateBody`,
que é Etapa 4. Esta spec resolve a dependência trazendo só o modelo e o editor pra
frente, sem nenhum motor de avaliação/envio.

## Escopo

- Migration: `DunningRule` + `DunningStep` (sem `DunningExecution` — nasce na Etapa 4
  junto com o motor de avaliação, quando a FK faz sentido)
- `core/dunning-template.ts`: parse de variáveis, whitelist, render puro
- Seed idempotente (`prisma/seed.ts`) da régua padrão pré-paga em `REVIEW`, 6 passos
  D-5 a D+5, textos de `docs/projeto/tecnico/06-regua-e-canais.md`
- `features/dunning/{schema,queries,service,actions}.ts`
- Tela `/regua`: lista de passos ordenados por `offsetDays`, drawer de edição por
  passo com editor de template + prévia usando uma cobrança real escolhida pelo
  operador

**Fora de escopo**: `dunning-evaluate`, `messages-dispatch`, `DunningExecution`,
travas T5–T8, modo revisão com as 3 opções de ativação, ação `SUSPEND` de verdade
(o passo pode ser cadastrado com `action: SUSPEND`, mas nada executa).

## Schema

```prisma
enum DunningStatus { DRAFT REVIEW ACTIVE PAUSED }
enum DunningAction { SEND_MESSAGE SUSPEND NOTIFY_OWNER }

model DunningRule {
  id        String        @id @default(uuid(7))
  name      String
  status    DunningStatus @default(DRAFT)
  isDefault Boolean       @default(false)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  steps     DunningStep[]

  @@map("dunning_rules")
}

model DunningStep {
  id           String        @id @default(uuid(7))
  ruleId       String
  offsetDays   Int                          // negativo = antes do vencimento
  action       DunningAction @default(SEND_MESSAGE)
  templateBody String?                      // com variáveis {{...}}
  isActive     Boolean       @default(true)

  rule         DunningRule   @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@unique([ruleId, offsetDays])
  @@map("dunning_steps")
}
```

- **SQL manual na migration**: índice único parcial `dunning_rules (is_default) WHERE
  "isDefault" = true` — mesma trava de "um padrão só" já usada em `channel_configs`,
  extrapolada por consistência (não está escrita literalmente no doc de régua, mas seguir
  o mesmo invariante evita duas réguas "padrão" simultâneas quando a Etapa 4 chegar).
- `DunningStep.executions` (relação com `DunningExecution`) **não existe ainda** — entra
  como migration nova, aditiva, quando `DunningExecution` for criado na Etapa 4. Não é
  destrutivo, não precisa de expand/contract.
- `@@unique([ruleId, offsetDays])` já impede dois passos no mesmo deslocamento pra
  mesma régua — vale desde já, mesmo sem o motor de avaliação.

## `core/dunning-template.ts`

Puro, sem I/O, dois exports:

```ts
export const TEMPLATE_VARIABLES = [
  'cliente.primeiro_nome',
  'cliente.nome',
  'cobranca.valor',
  'cobranca.vencimento',
  'cobranca.dias_atraso',
  'pix.chave',
  'negocio.nome',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateContext = Record<TemplateVariable, string>;

/** Extrai as variáveis {{...}} usadas no texto, sem validar se existem. */
export function extractTemplateVariables(text: string): string[];

/** Lança se alguma variável usada não estiver na whitelist. */
export function assertKnownVariables(text: string): void;

/** Substitui {{var}} pelos valores do contexto. Assume variáveis já validadas. */
export function renderTemplate(text: string, context: TemplateContext): string;
```

- `assertKnownVariables` é chamado no `service.ts` ao salvar um passo — variável
  desconhecida é **erro de validação na hora de salvar**, nunca string vazia no envio
  (regra dura do doc 06).
- `assertKnownVariables` também recusa qualquer variável fora da whitelist, o que
  cobre de graça o caso `{{assinatura.senha}}` — a variável não existe na lista, então
  nunca passa. Nenhuma lógica extra de "lista negra" é necessária.
- `renderTemplate` é usado só pela prévia nesta spec (sem motor de despacho ainda).

## `features/dunning/`

```
features/dunning/
  schema.ts     Zod: dunningStepSchema (offsetDays, action, templateBody, isActive)
  queries.ts    listDunningSteps(ruleId), getDefaultRule()
  service.ts    createStep, updateStep, deleteStep — todas chamam assertKnownVariables
  actions.ts    Server Actions finas
  components/
    step-list.tsx        lista ordenada por offsetDays
    step-drawer.tsx       form + preview
    template-preview.tsx  select de cobrança real + renderTemplate
```

- **Service não faz avaliação nenhuma** — só CRUD de passo com a validação de
  variável antes de persistir. Cálculo de `cobranca.dias_atraso` etc. na prévia é
  cálculo de apresentação (data local, `formatLocalDate`), não regra de negócio nova.
- `getDefaultRule()` busca a régua com `isDefault: true` (populada pelo seed) — a
  tela `/regua` edita essa régua diretamente; criar uma segunda régua fica pra Etapa 4
  (não há caso de uso pra múltiplas réguas ainda).
- Erros de domínio: `UnknownTemplateVariableError` (lista as variáveis inválidas na
  mensagem, pt-BR), `DuplicateStepOffsetError` (bate no `@@unique([ruleId,
  offsetDays])`).

## Prévia com dado real

`TemplatePreview` (client): um `<select>` de cobranças recentes (query simples,
`Charge` + `Customer` + `Payment`s, reaproveitando padrão de `getChargesForCustomer`
mas sem filtro por cliente — lista as N mais recentes). Ao escolher uma cobrança,
monta o `TemplateContext` a partir dela e do `Settings` (fuso, chave Pix, nome do
negócio) e chama `renderTemplate` — tudo client-side, sem Server Action nova (o
`context` já veio do servidor via prop, `renderTemplate` é puro e seguro no client).

Se não houver nenhuma cobrança no banco: mensagem "Nenhuma cobrança cadastrada ainda
pra pré-visualizar — o texto abaixo mostra as variáveis sem substituir." e o template
renderiza cru (sem `renderTemplate`), deixando claro que é fallback.

## UI

Rota `/regua` (já reservada na sidebar, "Réguas"). Página lista os 6 passos da régua
padrão ordenados por `offsetDays`, cada linha com resumo (offset, ação, se tem
template). Clique abre `StepDrawer`:

- Campos: `offsetDays` (number), `action` (select), `templateBody` (textarea),
  `isActive` (checkbox).
- Abaixo do textarea, `TemplatePreview` com o select de cobrança.
- Submit valida com o mesmo `dunningStepSchema` do form e da action — erro de
  variável desconhecida aparece inline no campo de texto, não só em toast.
- Badge no topo da página mostra `status` da régua (`REVIEW` no estado inicial) —
  sem botão de ativar ainda, isso é Etapa 4.

## Testes

- `core/dunning-template.test.ts`: extrai variáveis de texto com 0/1/N ocorrências;
  aceita todas as 7 da whitelist; rejeita variável desconhecida incluindo
  `assinatura.senha`; renderiza substituindo corretamente; variável repetida no texto
  substitui todas as ocorrências.
- `features/dunning/service.integration.test.ts`: criar passo com variável
  desconhecida falha antes de tocar o banco; dois passos com mesmo `offsetDays` na
  mesma régua batem no índice único (inserção real, não só o `if` do service);
  atualizar passo existente re-valida o template.
- Seed: rodar `pnpm db:seed` duas vezes não duplica a régua nem os passos
  (idempotência, mesmo padrão do seed de usuário).

## Critério de pronto

Régua padrão nasce em `REVIEW` com os 6 passos do doc, textos batendo com os exemplos.
Operador edita um passo, tenta salvar com `{{variavel_invalida}}` e recebe erro no
campo antes de qualquer escrita no banco. Escolhe uma cobrança real na prévia e vê o
texto renderizado com valor, vencimento e nome do cliente corretos. Nenhuma mensagem
sai, nenhum job roda — isso é Etapa 4.
