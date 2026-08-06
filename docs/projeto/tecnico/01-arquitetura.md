# 01 — Arquitetura

> Escopo B, single-tenant, entrega fechada.

## Stack

| Camada | Escolha | Motivo |
|---|---|---|
| App | Next.js (App Router), TypeScript | Um único deployable. Server Components para leitura, Server Actions para escrita, Route Handlers para cron e webhook. |
| Banco | PostgreSQL — Neon (plano free) | 0,5 GB cobre 1.000 assinantes com folga. Migra para Cloud SQL só se doer. |
| ORM | Prisma | Schema legível, migrations maduras, `BigInt` nativo. |
| Hospedagem | Google Cloud Run — `southamerica-east1` | Free tier cobre o volume inteiro. Container, então pool de conexão normal. |
| Agendamento | Cloud Scheduler → Route Handler com OIDC | 3 jobs grátis. Substitui o Graphile Worker. |
| Segredos | Secret Manager, montado como env var no Cloud Run | Chave de criptografia e credenciais de canal fora do repositório. |
| UI | Tailwind + shadcn/ui | Mesma escolha do spec original. |
| Formulários | react-hook-form + Zod | Schema único: valida no cliente e revalida no servidor. |

**Não usamos:** monorepo, Turborepo, NestJS, ts-rest, Graphile Worker, Redis, RLS. Todos existiam para resolver multi-tenancy, dois deployables ou consumo por front separado — nenhum dos três se aplica aqui.

## O que sumiu do spec original, e por quê

| Removido | Motivo |
|---|---|
| `tenantId` em toda tabela, RLS, `FORCE ROW LEVEL SECURITY`, `TENANT_SCOPED_MODELS` | Um cliente. Não há de quem isolar. |
| `Membership`, RBAC, `@RequirePermission`, `PlanLimitGuard` | Um usuário. |
| Billing do próprio SaaS | Projeto fechado, sem mensalidade. |
| Onboarding em 6 passos com progresso derivado | O sistema é entregue configurado, com treinamento de 2h. |
| Ledger de partidas dobradas | Receita, custo e margem saem de `SUM` sobre `charges` e `payments`. O ledger se paga com estorno, alocação parcial, write-off e auditoria contábil — nada disso está no escopo. |
| Importação em 9 fases | Importação única, planilha conhecida, 123 linhas. Script de seed + conferência na tela. |
| Contrato ts-rest | Não há front separado. O tipo atravessa direto do servidor para o Server Component. |
| Outbox + dispatcher | Sem consumidores externos de evento. Efeito colateral é a linha em `messages`, escrita na mesma transação. |

## O que **não** sumiu

Estas continuam sendo regra dura, e violá-las é bug:

- Dinheiro é `BigInt` em centavos, sufixo `...Cents`. Nunca `float`, nem em variável temporária.
- Arredondamento *round half up*, em centavos, uma vez, no fim do cálculo.
- `Charge.costCents` é congelado na emissão e nunca recalculado.
- Nenhuma coluna de saldo. Total é sempre `SUM`.
- Cobrança com pagamento registrado não é cancelada nem editada — correção é registro novo.
- Usuário e senha de acesso do assinante são criptografados, mascarados e ficam fora de log, export e mensagem.
- Vencimento é `23:59:59` no fuso local; âncora de fim de mês preservada.
- Todo job é idempotente. Rodar duas vezes produz o mesmo resultado.
- Régua respeita quiet hours, dedupe diário, opt-out e kill switch.

## Estrutura de pastas

```
src/
  app/
    (auth)/login/
    (app)/
      page.tsx                    dashboard
      clientes/
      assinaturas/
      cobrancas/
      mensagens/
      regua/
      fornecedores/
      planos/
      configuracoes/
    api/
      cron/
        charges-generate/route.ts
        dunning-evaluate/route.ts
        messages-dispatch/route.ts
  features/
    customers/    { actions.ts, queries.ts, service.ts, components/ }
    subscriptions/
    charges/
    payments/
    dunning/
    messaging/
    suppliers/
    reports/
  core/                           puro, sem I/O — ver 03 e 04
    money.ts
    dates.ts
    billing-cycle.ts
    dunning-rules.ts
  lib/
    db.ts                         cliente Prisma singleton
    auth.ts                       sessão
    crypto.ts                     AES-256-GCM
    format.ts                     dinheiro, data, telefone
  components/ui/                  shadcn
prisma/
  schema.prisma
  migrations/
```

### Direção de dependência

```
app/       ──> features/  ──> core/, lib/
features/  ──> core/, lib/
core/      ──> nada (nem Prisma, nem Next, nem I/O)
lib/       ──> Prisma, env
```

Regras:

- **`core/` não importa Prisma, Next, `process.env` nem `new Date()`.** Data e hora entram por parâmetro. É o que torna o cálculo financeiro testável em milissegundos.
- **Uma feature não importa de outra feature.** Precisou de algo compartilhado, promove para `core/` (se é cálculo puro) ou `lib/` (se é infra).
- **Server Action não contém regra.** Valida com Zod, chama o service, revalida o cache. Regra vive no service; cálculo vive em `core/`.
- **Nenhum componente cliente recebe `BigInt`.** Converte para string na borda do servidor.

## Escrita — o padrão

Toda mudança de estado relevante acontece em **uma transação** contendo a escrita e o seu efeito colateral.

```ts
// features/charges/service.ts
export async function registerPayment(input: RegisterPaymentInput) {
  return db.$transaction(async (tx) => {
    const charge = await tx.charge.findUniqueOrThrow({ where: { id: input.chargeId } });
    assertPayable(charge);                                    // core/ — puro

    const payment = await tx.payment.create({ data: { ... } });
    const status  = resolveChargeStatus(charge, payment);     // core/ — puro
    await tx.charge.update({ where: { id: charge.id }, data: { status } });

    // cancela os passos futuros da régua para esta cobrança
    await tx.message.updateMany({
      where: { chargeId: charge.id, status: 'PENDING' },
      data:  { status: 'CANCELLED', cancelReason: 'PAYMENT_RECEIVED' },
    });

    return payment;
  });
}
```

- ❌ Chamada HTTP a provider externo dentro da transação. Vira linha `PENDING` em `messages`, despachada pelo cron.
- ❌ Cálculo dentro do service. Service busca, chama `core/`, persiste.
- ❌ `revalidatePath` dentro da transação.

## Autenticação

Um usuário. Sem OAuth, sem convite, sem recuperação por e-mail.

- Tabela `users` com uma linha. Senha em **argon2id**.
- Sessão em cookie `httpOnly`, `secure`, `sameSite=lax`, JWT assinado com `SESSION_SECRET`, validade de 30 dias com renovação deslizante.
- Middleware do Next protege tudo em `(app)/`; `(auth)/login` e `/api/cron/*` ficam de fora.
- Troca de senha pela tela de configurações.

A tabela existe (em vez de credencial em env var) porque permite trocar a senha sem redeploy e acrescentar um segundo operador depois sem redesenhar nada.

## Cron

Cloud Scheduler chama Route Handlers com token OIDC. O handler valida o token; sem ele, 401.

| Job | Frequência | O que faz |
|---|---|---|
| `charges-generate` | diário 03:00 | Emite as cobranças que vencem nos próximos 10 dias e marca as vencidas como `OVERDUE` |
| `dunning-evaluate` | diário 07:00 | Avalia a régua e cria as linhas `PENDING` em `messages` |
| `messages-dispatch` | a cada 15 min, 08:00–20:00 | Envia as `PENDING` respeitando as travas; falha vira retry na próxima passada |

Todos idempotentes por constraint — detalhe em [`06-regua-e-canais.md`](./06-regua-e-canais.md).

⚠️ O fuso do Cloud Scheduler é configurado em `America/Sao_Paulo`. O horário de referência do sistema é sempre o local, nunca UTC.

## Ambientes

| | Desenvolvimento | Produção |
|---|---|---|
| Banco | Neon branch de dev, dados anonimizados | Neon principal, na conta do cliente |
| Chave de criptografia | `.env.local` | Secret Manager |
| Deploy | `next dev` | `gcloud run deploy` a partir da branch `main` |

⚠️ Base real só entra no ambiente do cliente, no fim do projeto. Durante o desenvolvimento, dados anonimizados — a base tem telefone e credencial de centenas de pessoas.

## Orçamento de tamanho

| Artefato | Limite | Ao estourar |
|---|---|---|
| Server Action | 30 linhas | Sobrou regra — mover para o service |
| Service (arquivo) | 250 linhas | Split por coesão |
| Função em `core/` | 40 linhas | Quase sempre são duas funções |
| Componente React | 150 linhas | Extrair subcomponente |
| Arquivo de rota (`page.tsx`) | 100 linhas | Rota é composição |
